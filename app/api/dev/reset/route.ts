import { NextResponse } from 'next/server';
import { resetDb } from '@/lib/db';

export async function POST() {
  resetDb();
  return NextResponse.json({ success: true, message: "Database reset successfully." });
}
