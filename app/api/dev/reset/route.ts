import { NextResponse } from 'next/server';
import { resetDb } from '@/lib/db';
import { isAdminSessionValid } from '@/lib/admin-session';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const result = await resetDb();
    return NextResponse.json({ ...result, message: 'Database reset successfully.' });
  } catch (error) {
    console.error('Development database reset failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, message: 'Unable to reset the database.' }, { status: 503 });
  }
}
