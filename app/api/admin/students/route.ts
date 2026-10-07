import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { assignStudent, deleteStudent } from '@/lib/db';

export async function POST(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request format.' },
      { status: 400 },
    );
  }

  const input = typeof body === 'object' && body !== null
    ? body as { name?: unknown; studentNumber?: unknown; identifierKind?: unknown }
    : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const identifier = typeof input.studentNumber === 'string' ? input.studentNumber.trim() : '';
  const identifierKind = input.identifierKind === 'cardTag' ? 'cardTag' : 'studentNumber';

  if (!name) {
    return NextResponse.json(
      { success: false, message: 'Participant name is required.' },
      { status: 400 },
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      { success: false, message: 'Name must be 100 characters or fewer.' },
      { status: 400 },
    );
  }

  if (identifier && !(identifierKind === 'cardTag'
    ? /^[0-9a-fA-F]{1,64}$/.test(identifier)
    : /^\d+$/.test(identifier))) {
    return NextResponse.json(
      {
        success: false,
        message: identifierKind === 'cardTag'
          ? 'Card UID must contain hexadecimal characters only.'
          : 'Student number must contain digits only.',
      },
      { status: 400 },
    );
  }

  try {
    const result = await assignStudent(name, identifier, identifierKind);
    return NextResponse.json(result, { status: result.success ? 201 : 409 });
  } catch (error) {
    console.error('Unable to add participant:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unable to add participant.' },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request format.' }, { status: 400 });
  }

  const id = typeof body === 'object' && body !== null && 'id' in body
    ? (body as { id?: unknown }).id
    : undefined;
  if (typeof id !== 'string') {
    return NextResponse.json({ success: false, message: 'Participant ID is required.' }, { status: 400 });
  }

  try {
    const result = await deleteStudent(id);
    return NextResponse.json(result, { status: result.success ? 200 : 404 });
  } catch (error) {
    console.error('Unable to remove participant:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, message: 'Unable to remove participant right now.' }, { status: 503 });
  }
}
