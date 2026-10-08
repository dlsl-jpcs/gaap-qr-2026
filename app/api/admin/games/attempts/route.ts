import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { supabaseRest } from '@/lib/supabase-rest';
import { GameRequestError, gameError, requireUuid } from '@/lib/games/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    if (!isAdminSessionValid(request)) throw new GameRequestError('Admin access required.', 401);
    const params = new URL(request.url).searchParams;
    const groupId = Number(params.get('groupId'));
    if (!Number.isInteger(groupId) || groupId < 1) throw new GameRequestError('Select a group.');
    const before = params.get('before');
    const beforeId = params.get('beforeId');
    if (before && (!Number.isFinite(Date.parse(before)) || !beforeId)) throw new GameRequestError('Invalid history cursor.');
    if (beforeId) requireUuid(beforeId, 'history cursor');
    const history = await supabaseRest('rpc/gaap_charades_history', { method: 'POST', body: JSON.stringify({ p_group_id: groupId, p_before: before || null, p_before_id: beforeId || null }) });
    return NextResponse.json({ success: true, history }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return gameError(error, true); }
}
