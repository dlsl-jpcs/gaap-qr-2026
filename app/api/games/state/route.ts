import { NextResponse } from 'next/server';
import { gameError, gameSnapshot } from '@/lib/games/server';
export const runtime = 'nodejs';
export async function GET() {
  try { return NextResponse.json({ success: true, snapshot: await gameSnapshot() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return gameError(error); }
}
