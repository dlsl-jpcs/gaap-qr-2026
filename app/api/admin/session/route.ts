import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  isAdminSessionValid,
} from '@/lib/admin-session';
import { verifyAdminPassword } from '@/lib/admin-password';
import { SupabaseRequestError } from '@/lib/supabase-rest';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: isAdminSessionValid(request) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sessionSecret = process.env.QR_GAAP_SESSION_SECRET?.trim();

  if (!supabaseUrl || !serviceRoleKey || !sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json(
      { success: false, message: 'Admin login is not configured on the server yet.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid login request.' },
      { status: 400 },
    );
  }

  const input = typeof body === 'object' && body !== null
    ? body as { password?: unknown }
    : {};
  const password = typeof input.password === 'string' ? input.password : '';

  if (!password || password.length > 256) {
    return NextResponse.json(
      { success: false, message: 'Enter the admin password.' },
      { status: 400 },
    );
  }

  try {
    const validPassword = await verifyAdminPassword(password);
    if (!validPassword) {
      return NextResponse.json(
        { success: false, message: 'Incorrect admin password.' },
        { status: 401 },
      );
    }

    const { token, maxAge } = createAdminSessionToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
    return response;
  } catch (error) {
    console.error('Admin password verification failed:', error instanceof Error ? error.message : 'Unknown error');
    const missingTable = error instanceof SupabaseRequestError && error.code === 'PGRST205';
    const missingPassword = error instanceof Error && error.message.includes('password is not set up');
    return NextResponse.json(
      {
        success: false,
        message: missingTable || missingPassword
          ? 'Admin password storage is not set up. Run supabase/admin-credentials.sql in the Supabase SQL Editor, then run npm run admin:set-password.'
          : 'Unable to verify the admin password right now.',
      },
      { status: 503 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
