import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { createGroupAccessCode, hashAccessCode, setFacilitatorPin } from '@/lib/games/session';
import { validateAdminPayload } from '@/lib/games/admin-validation';
import { GameRequestError, gameError, gameResponse, gameRpc, gameSnapshot, readGameBody, requireSameOrigin, requireUuid } from '@/lib/games/server';
export const runtime = 'nodejs';
const actions = ['prepare', 'start', 'end', 'reset', 'settings', 'words', 'group_code', 'maze_undo', 'charades_correct', 'adjust'];

export async function GET(request: Request) {
  try {
    if (!isAdminSessionValid(request)) throw new GameRequestError('Admin access required.', 401);
    return NextResponse.json({ success: true, snapshot: await gameSnapshot(null, true) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return gameError(error, true); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!isAdminSessionValid(request)) throw new GameRequestError('Admin access required.', 401);
    const body = await readGameBody(request);
    if (body.action === 'facilitator_pin') {
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
      if (pin.length < 4 || pin.length > 64) throw new GameRequestError('The facilitator PIN must be 4–64 characters.');
      await setFacilitatorPin(pin);
      return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.game !== 'maze' && body.game !== 'charades') throw new GameRequestError('Game not found.', 404);
    if (typeof body.action !== 'string' || !actions.includes(body.action)) throw new GameRequestError('Invalid game action.');
    const requestId = requireUuid(body.requestId, 'request ID');
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) throw new GameRequestError('Invalid game request.');
    const payload = { ...body.payload } as Record<string, unknown>;
    validateAdminPayload(body.game, body.action, payload);
    if (['prepare', 'start', 'end', 'reset'].includes(body.action) && payload.expectedRoundId !== null) requireUuid(payload.expectedRoundId, 'expected round');
    if (body.action === 'maze_undo') requireUuid(payload.resultId, 'Maze result');
    if (body.action === 'charades_correct') requireUuid(payload.attemptId, 'Charades attempt');
    if (body.action === 'group_code' || body.action === 'adjust') {
      if (typeof payload.groupId !== 'number' || !Number.isInteger(payload.groupId) || payload.groupId < 1) throw new GameRequestError('Invalid group.');
    }
    let code: string | undefined;
    if (body.action === 'group_code') {
      code = createGroupAccessCode(payload.groupId as number, requestId);
      payload.hash = hashAccessCode(code);
      payload.version = requestId;
    }
    // Stable session fingerprint supports auditing without inventing an Auth user.
    const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('qr_gaap_admin_session=')) || '';
    const actor = 'admin:' + hashAccessCode(cookie).slice(0, 16);
    const result = await gameRpc('gaap_admin_command', { p_game_type: body.game, p_action: body.action, p_payload: payload, p_request_id: requestId, p_actor: actor });
    if (result.success && code) return NextResponse.json({ ...result, code, groupId: payload.groupId }, { headers: { 'Cache-Control': 'no-store' } });
    return gameResponse(result);
  } catch (error) { return gameError(error, true); }
}
