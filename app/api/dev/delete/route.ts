import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { deleteStudent } from '@/lib/db';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    const result = await deleteStudent(id);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Development participant delete failed:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ success: false }, { status: 503 });
  }
}
