import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { moveStudent } from '@/lib/db';

export async function POST(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const { studentId, newGroupId } = await request.json();

    if (!studentId || !newGroupId) {
      return NextResponse.json({ success: false, message: "Missing parameters" }, { status: 400 });
    }

    const result = await moveStudent(studentId, Number(newGroupId));
    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
  } catch (error) {
    console.error('Unable to move participant:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, message: 'Unable to move participant right now.' }, { status: 503 });
  }
}
