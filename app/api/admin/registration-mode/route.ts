import { NextResponse } from 'next/server';
import { RegistrationMode, setRegistrationMode } from '@/lib/db';

const isRegistrationMode = (value: unknown): value is RegistrationMode =>
  value === 'nfc' || value === 'studentNumber' || value === 'manualName';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isRegistrationMode(body?.registrationMode)) {
      return NextResponse.json(
        { success: false, message: "Invalid registration mode." },
        { status: 400 },
      );
    }

    const registrationMode = setRegistrationMode(body.registrationMode);
    return NextResponse.json({ success: true, registrationMode });
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request format." },
      { status: 400 },
    );
  }
}
