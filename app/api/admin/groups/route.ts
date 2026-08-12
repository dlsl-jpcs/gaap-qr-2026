import { NextResponse } from 'next/server';
import { createGroup, deleteGroup, updateGroupCapacity } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { action, groupId, maxCapacity } = await request.json();

    if (action === 'create') {
      const newId = createGroup();
      return NextResponse.json({ success: true, groupId: newId });
    }
    
    if (action === 'delete') {
      if (!groupId) return NextResponse.json({ success: false, message: "Missing groupId" }, { status: 400 });
      deleteGroup(Number(groupId));
      return NextResponse.json({ success: true });
    }
    
    if (action === 'capacity') {
      if (!groupId || !maxCapacity) return NextResponse.json({ success: false, message: "Missing params" }, { status: 400 });
      updateGroupCapacity(Number(groupId), Number(maxCapacity));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  }
}
