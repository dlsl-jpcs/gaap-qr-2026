import { NextResponse } from 'next/server';
import { requireFacilitator } from '@/lib/games/session';
import { GameRequestError, gameError, gameSnapshot } from '@/lib/games/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const session = await requireFacilitator(request);
    if (!session) throw new GameRequestError('Enter your group facilitator code to continue.', 401);
    return NextResponse.json({ success: true, snapshot: await gameSnapshot(session.groupId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return gameError(error); }
}
