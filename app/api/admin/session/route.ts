import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  configuredAdminEmail,
  createAdminSessionToken,
  isAdminSessionValid,
} from '@/lib/admin-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: isAdminSessionValid(request) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const adminEmail = configuredAdminEmail();
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  const sessionSecret = process.env.QR_GAAP_SESSION_SECRET?.trim();

  if (!adminEmail || !supabaseUrl || !anonKey || !sessionSecret || sessionSecret.length < 32) {
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
    ? body as { email?: unknown; password?: unknown }
    : {};
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!email || !password || email !== adminEmail) {
    return NextResponse.json(
      { success: false, message: 'Email or password is incorrect.' },
      { status: 401 },
    );
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    if (!authResponse.ok) {
      return NextResponse.json(
        { success: false, message: 'Email or password is incorrect.' },
        { status: 401 },
      );
    }

    const authData = await authResponse.json() as { user?: { email?: string } };
    if (authData.user?.email?.trim().toLowerCase() !== adminEmail) {
      return NextResponse.json(
        { success: false, message: 'This account is not allowed to access the admin page.' },
        { status: 403 },
      );
    }

    const { token, maxAge } = createAdminSessionToken(adminEmail);
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Supabase Auth is temporarily unavailable.' },
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
