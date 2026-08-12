import { NextResponse } from 'next/server';
import { assignStudent } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { count } = await request.json();
    const amount = Number(count) || 50;
    
    let added = 0;
    for (let i = 0; i < amount; i++) {
      // random 9-digit student number
      const randomSn = Math.floor(100000000 + Math.random() * 900000000).toString();
      const res = assignStudent(`Test Student ${randomSn.slice(-4)}`, randomSn);
      if (!res.success) {
         break; // Event full or some other limit hit
      }
      added++;
    }
    
    return NextResponse.json({ success: true, message: `Successfully added ${added} students.` });
  } catch (e) {
    return NextResponse.json({ success: false, message: "Error mass adding." }, { status: 400 });
  }
}
