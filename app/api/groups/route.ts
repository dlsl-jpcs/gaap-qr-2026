import { NextResponse } from 'next/server';
import { getDbData } from '@/lib/db';

export async function GET() {
  try {
    const data = await getDbData();
    const groups = data.groups.map(group => ({
      groupId: group.id,
      maxCapacity: group.maxCapacity,
      members: data.students.filter(student => student.groupId === group.id),
    }));

    return NextResponse.json(
      {
        success: true,
      groups: groups.map(group => ({
        ...group,
        members: group.members.map(student => ({
          id: student.id,
          name: student.name,
          groupId: student.groupId,
          timestamp: student.timestamp,
        })),
      })),
        total: data.students.length,
        registrationMode: data.registrationMode,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Unable to load QR-GAAP groups:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: 'Unable to load groups from Supabase.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
