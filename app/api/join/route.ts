import { NextResponse } from 'next/server';
import { assignStudent } from '@/lib/db';
import { fetchStudentInfo, deriveDisplayName } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studentNumber } = body;

    if (!studentNumber) {
      return NextResponse.json({ success: false, message: "Student Number is required." }, { status: 400 });
    }
    
    // Convert to string and trim
    const formattedStudentNumber = String(studentNumber).trim();

    if (isNaN(Number(formattedStudentNumber))) {
       return NextResponse.json({ success: false, message: "Student Number must be a valid number." }, { status: 400 });
    }

    // Fetch from DLSL API
    const info = await fetchStudentInfo(formattedStudentNumber);

    if (!info) {
      return NextResponse.json({ success: false, message: "Student not found in DLSL database." }, { status: 404 });
    }

    // Determine display name
    const finalName = info.name || deriveDisplayName(info.email);

    // Assign to group
    const result = assignStudent(finalName, formattedStudentNumber);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, message: "Invalid request format or server error." }, { status: 400 });
  }
}
