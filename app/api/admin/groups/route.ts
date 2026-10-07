import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/admin-session';
import { createGroup, deleteGroup, getDbData, updateGroupCapacity } from '@/lib/db';

export async function GET(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const data = await getDbData();
    const groups = data.groups.map(group => ({
      groupId: group.id,
      maxCapacity: group.maxCapacity,
      members: data.students.filter(student => student.groupId === group.id),
    }));
    return NextResponse.json({
      success: true,
      groups,
      total: data.students.length,
      registrationMode: data.registrationMode,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Unable to load admin groups:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, message: 'Unable to load groups from Supabase.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAdminSessionValid(request)) {
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const { action, groupId, maxCapacity } = await request.json();

    if (action === 'create') {
      const newId = await createGroup();
      return NextResponse.json({ success: true, groupId: newId });
    }
    
    if (action === 'delete') {
      if (!groupId) return NextResponse.json({ success: false, message: "Missing groupId" }, { status: 400 });
      const result = await deleteGroup(Number(groupId));
      return NextResponse.json(result, { status: result.success ? 200 : 409 });
    }
    
    if (action === 'capacity') {
      if (!groupId || !maxCapacity) return NextResponse.json({ success: false, message: "Missing params" }, { status: 400 });
      const result = await updateGroupCapacity(Number(groupId), Number(maxCapacity));
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error('Group operation failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unable to update groups.' },
      { status: 503 },
    );
  }
}
