import { NextResponse } from 'next/server';
import { moveStudent } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { studentId, newGroupId } = await request.json();

    if (!studentId || !newGroupId) {
      return NextResponse.json({ success: false, message: "Missing parameters" }, { status: 400 });
    }

    const result = moveStudent(studentId, Number(newGroupId));
    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  }
}
