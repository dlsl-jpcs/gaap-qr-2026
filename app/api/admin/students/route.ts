import { NextResponse } from 'next/server';
import { assignStudent, getDbData } from '@/lib/db';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request format.' },
      { status: 400 },
    );
  }

  const requestData = typeof body === 'object' && body !== null ? body : {};
  const rawName = 'name' in requestData ? requestData.name : undefined;
  const rawStudentNumber = 'studentNumber' in requestData ? requestData.studentNumber : undefined;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const studentNumber = typeof rawStudentNumber === 'string' ? rawStudentNumber.trim() : '';

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

  if (studentNumber && !/^[0-9a-fA-F]{1,64}$/.test(studentNumber)) {
    return NextResponse.json(
      { success: false, message: 'Student number or card UID must contain hexadecimal characters only.' },
      { status: 400 },
    );
  }

  if (
    studentNumber &&
    getDbData().students.some(student =>
      typeof student.studentNumber === 'string' &&
      student.studentNumber.toLowerCase() === studentNumber.toLowerCase()
    )
  ) {
    return NextResponse.json(
      { success: false, message: 'A participant with that student number or card UID is already registered.' },
      { status: 409 },
    );
  }

  const result = assignStudent(name, studentNumber);
  return NextResponse.json(result, { status: result.success ? 201 : 409 });
}
