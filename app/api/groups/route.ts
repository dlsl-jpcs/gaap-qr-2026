import { NextResponse } from 'next/server';
import { getDbData } from '@/lib/db';

export async function GET() {
  const data = getDbData();
  
  const groups = data.groups.map(g => ({
    groupId: g.id,
    maxCapacity: g.maxCapacity,
    members: data.students.filter(s => s.groupId === g.id)
  }));
  
  return NextResponse.json(
    { success: true, groups, total: data.students.length },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
