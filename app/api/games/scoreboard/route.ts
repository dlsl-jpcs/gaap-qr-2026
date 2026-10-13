import { NextResponse } from 'next/server';
import { sharedCacheHeaders } from '@/lib/cdn-cache';
import { gameError, gameSnapshot } from '@/lib/games/server';
export const runtime = 'nodejs';
// Same public snapshot as /api/games/state, shared through the CDN for /score.
// Screens that show a running timer keep using the uncached state route.
export async function GET() {
  try { return NextResponse.json({ success: true, snapshot: await gameSnapshot() }, { headers: sharedCacheHeaders(2) }); }
  catch (error) { return gameError(error); }
}
