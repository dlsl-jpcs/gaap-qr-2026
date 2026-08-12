import { NextResponse } from 'next/server';
import { getDbData, saveDbData } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    const data = getDbData();
    data.students = data.students.filter(s => s.id !== id);
    saveDbData(data);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
