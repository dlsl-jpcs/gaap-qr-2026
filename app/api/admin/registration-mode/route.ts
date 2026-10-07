import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { RegistrationMode, setRegistrationMode } from '@/lib/db';

const isRegistrationMode = (value: unknown): value is RegistrationMode =>
  value === 'nfc' || value === 'studentNumber' || value === 'manualName';

export async function POST(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!isRegistrationMode(body?.registrationMode)) {
      return NextResponse.json(
        { success: false, message: "Invalid registration mode." },
        { status: 400 },
      );
    }

    const registrationMode = await setRegistrationMode(body.registrationMode);
    return NextResponse.json({ success: true, registrationMode });
  } catch (error) {
    console.error('Unable to save registration mode:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unable to save registration mode.' },
      { status: 503 },
    );
  }
}
