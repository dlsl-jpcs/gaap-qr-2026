import { NextResponse } from 'next/server';
import { FACILITATOR_COOKIE, createFacilitatorToken, requireFacilitator, verifyFacilitatorCode } from '@/lib/games/session';
import { GameRequestError, gameError, readGameBody, requireSameOrigin } from '@/lib/games/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const session = await requireFacilitator(request);
    return NextResponse.json({ authenticated: Boolean(session), groupId: session?.groupId ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return gameError(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readGameBody(request);
    const groupId = body.groupId;
    if (typeof groupId !== 'number' || !Number.isInteger(groupId) || groupId < 1 || typeof body.code !== 'string' || !body.code.trim()) throw new GameRequestError('Choose a group and enter the facilitator PIN.');
    const version = await verifyFacilitatorCode(groupId, body.code);
    if (!version) throw new GameRequestError('That PIN is incorrect, or the admin has not set one yet.', 401);
    const token = createFacilitatorToken(groupId, version);
    const response = NextResponse.json({ success: true, groupId });
    response.cookies.set(FACILITATOR_COOKIE, token.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: token.maxAge });
    return response;
  } catch (error) { return gameError(error); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const response = NextResponse.json({ success: true });
    response.cookies.set(FACILITATOR_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
    return response;
  } catch (error) { return gameError(error); }
}
