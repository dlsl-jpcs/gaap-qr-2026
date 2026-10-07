import { NextResponse } from 'next/server';
import { assignStudent, getDbData } from '@/lib/db';
import { fetchStudentInfo, deriveDisplayName } from '@/lib/api';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request format." },
      { status: 400 },
    );
  }

  const requestData = typeof body === 'object' && body !== null ? body : {};
  const registrationMode = getDbData().registrationMode;

  if (registrationMode === 'manualName') {
    const rawName = 'name' in requestData ? requestData.name : undefined;
    const name = typeof rawName === 'string' ? rawName.trim() : '';

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Name is required." },
        { status: 400 },
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { success: false, message: "Name must be 100 characters or fewer." },
        { status: 400 },
      );
    }

    return NextResponse.json(assignStudent(name));
  }

  const rawStudentNumber = 'studentNumber' in requestData
    ? requestData.studentNumber
    : undefined;
  const isNfcMode = registrationMode === 'nfc';
  const rawIdentifier = String(rawStudentNumber ?? '').trim();
  const formattedStudentNumber = isNfcMode ? rawIdentifier.toLowerCase() : rawIdentifier;

  if (!formattedStudentNumber) {
    return NextResponse.json(
      { success: false, message: "Student Number is required." },
      { status: 400 },
    );
  }

  // The NFC reader returns a hexadecimal card UID; typed student numbers are numeric.
  const isValidIdentifier = isNfcMode
    ? /^[0-9a-fA-F]{1,64}$/.test(formattedStudentNumber)
    : /^\d+$/.test(formattedStudentNumber);

  if (!isValidIdentifier) {
    return NextResponse.json(
      {
        success: false,
        message: isNfcMode
          ? "Card UID must contain hexadecimal characters only."
          : "Student Number must contain digits only.",
      },
      { status: 400 },
    );
  }

  try {
    const info = await fetchStudentInfo(formattedStudentNumber);

    if (!info) {
      return NextResponse.json(
        { success: false, message: "Student not found in DLSL database." },
        { status: 404 },
      );
    }

    const finalName = info.name || deriveDisplayName(info.email);
    const result = assignStudent(finalName, formattedStudentNumber);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lookup error';
    console.error('Student lookup failed:', message);
    return NextResponse.json(
      {
        success: false,
        message: "The DLSL student lookup is temporarily unavailable. Please try again.",
      },
      { status: 502 },
    );
  }
}
