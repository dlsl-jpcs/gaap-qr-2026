import { NextResponse } from 'next/server';
import { getRegistrationMode } from '@/lib/db';
import { sharedCacheHeaders } from '@/lib/cdn-cache';

// The registration page only needs the mode; it no longer downloads the roster.
export async function GET() {
  try {
    const registrationMode = await getRegistrationMode();
    return NextResponse.json({ success: true, registrationMode }, { headers: sharedCacheHeaders(2) });
  } catch (error) {
    console.error('Unable to load registration mode:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: 'Unable to load registration settings.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
