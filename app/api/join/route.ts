import { NextResponse } from 'next/server';
import { assignStudent } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, studentNumber } = body;

    if (!name || !studentNumber) {
      return NextResponse.json({ success: false, message: "Name and Student Number are required." }, { status: 400 });
    }
    
    if (isNaN(Number(studentNumber))) {
       return NextResponse.json({ success: false, message: "Student Number must be a valid number." }, { status: 400 });
    }

    const result = assignStudent(name.trim(), String(studentNumber).trim());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, message: "Invalid request format." }, { status: 400 });
  }
}
