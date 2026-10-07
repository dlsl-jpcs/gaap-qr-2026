import 'server-only';

import { supabaseQuery, supabaseRest } from '@/lib/supabase-rest';

export interface Student {
  id: string;
  name: string;
  studentNumber: string;
  groupId: number;
  timestamp: string;
}

export interface GroupConfig {
  id: number;
  maxCapacity: number;
}

export type RegistrationMode = 'nfc' | 'studentNumber' | 'manualName';

export interface DbData {
  students: Student[];
  groups: GroupConfig[];
  registrationMode: RegistrationMode;
}

type SupabaseGroup = {
  id: number;
  capacity: number;
};

type SupabaseStudent = {
  id: string;
  name: string;
  student_number: string | null;
  card_tag: string | null;
  group_id: number;
  joined_at: string;
};

type RegistrationResponse = {
  success: boolean;
  student?: {
    id: string;
    name: string;
    studentNumber: string;
    groupId: number;
    timestamp: string;
  };
  message: string;
};

type OperationResponse = {
  success: boolean;
  message?: string;
};

const isRegistrationMode = (value: unknown): value is RegistrationMode =>
  value === 'nfc' || value === 'studentNumber' || value === 'manualName';

export async function getRegistrationMode(): Promise<RegistrationMode> {
  const settings = await supabaseRest<Array<{ registration_mode: string }>>(
    `event_settings?${supabaseQuery({
      select: 'registration_mode',
      singleton: 'eq.true',
      limit: '1',
    })}`,
  );
  const registrationMode = settings[0]?.registration_mode;
  if (!isRegistrationMode(registrationMode)) {
    throw new Error('Supabase event settings are missing or have an invalid registration mode.');
  }
  return registrationMode;
}

function mapStudent(student: SupabaseStudent): Student {
  return {
    id: student.id,
    name: student.name,
    studentNumber: student.student_number || student.card_tag || '',
    groupId: student.group_id,
    timestamp: student.joined_at,
  };
}

export async function getDbData(): Promise<DbData> {
  const [groups, students, settings] = await Promise.all([
    supabaseRest<SupabaseGroup[]>(
      `groups?${supabaseQuery({ select: 'id,capacity', order: 'id.asc' })}`,
    ),
    supabaseRest<SupabaseStudent[]>(
      `students?${supabaseQuery({
        select: 'id,name,student_number,card_tag,group_id,joined_at',
        order: 'joined_at.asc',
      })}`,
    ),
    supabaseRest<Array<{ registration_mode: string }>>(
      `event_settings?${supabaseQuery({
        select: 'registration_mode',
        singleton: 'eq.true',
        limit: '1',
      })}`,
    ),
  ]);

  const registrationMode = settings[0]?.registration_mode;
  if (!isRegistrationMode(registrationMode)) {
    throw new Error('Supabase event settings are missing or have an invalid registration mode.');
  }

  return {
    groups: groups.map(group => ({ id: group.id, maxCapacity: group.capacity })),
    students: students.map(mapStudent),
    registrationMode,
  };
}

export async function setRegistrationMode(registrationMode: RegistrationMode) {
  const updated = await supabaseRest<Array<{ registration_mode: RegistrationMode }>>(
    `event_settings?${supabaseQuery({ singleton: 'eq.true' })}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ registration_mode: registrationMode, updated_at: new Date().toISOString() }),
    },
  );

  if (!updated[0]) {
    throw new Error('The event settings row is missing. Run the Supabase setup SQL again.');
  }
  return updated[0].registration_mode;
}

export async function assignStudent(
  name: string,
  identifier = '',
  identifierKind: 'studentNumber' | 'cardTag' = 'studentNumber',
) {
  const cleanIdentifier = identifier.trim();
  const result = await supabaseRest<RegistrationResponse>('rpc/register_participant', {
    method: 'POST',
    body: JSON.stringify({
      p_name: name.trim(),
      p_student_number: identifierKind === 'studentNumber' ? cleanIdentifier || null : null,
      p_card_tag: identifierKind === 'cardTag' ? cleanIdentifier || null : null,
    }),
  });

  if (result.success && result.student) {
    return { ...result, student: result.student };
  }
  return result;
}

export async function createGroup() {
  const groups = await supabaseRest<Array<{ id: number }>>(
    `groups?${supabaseQuery({ select: 'id', order: 'id.asc' })}`,
  );
  const existingIds = new Set(groups.map(group => group.id));
  const id = Array.from({ length: 14 }, (_, index) => index + 1)
    .find(candidate => !existingIds.has(candidate));

  if (!id) {
    throw new Error('All 14 groups already exist.');
  }

  await supabaseRest('groups', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id,
      name: `Group ${String(id).padStart(2, '0')}`,
      capacity: 20,
    }),
  });
  return id;
}

export async function deleteGroup(id: number) {
  return supabaseRest<OperationResponse>('rpc/delete_group_with_members', {
    method: 'POST',
    body: JSON.stringify({ p_group_id: id }),
  });
}

export async function updateGroupCapacity(id: number, maxCapacity: number) {
  const result = await supabaseRest<OperationResponse>('rpc/update_group_capacity', {
    method: 'POST',
    body: JSON.stringify({ p_group_id: id, p_capacity: maxCapacity }),
  });
  return result;
}

export async function moveStudent(studentId: string, newGroupId: number) {
  return supabaseRest<OperationResponse>('rpc/move_student_to_group', {
    method: 'POST',
    body: JSON.stringify({ p_student_id: studentId, p_new_group_id: newGroupId }),
  });
}

export async function deleteStudent(studentId: string) {
  return supabaseRest<OperationResponse>('rpc/delete_participant', {
    method: 'POST',
    body: JSON.stringify({ p_student_id: studentId }),
  });
}

export async function resetDb() {
  return supabaseRest<OperationResponse>('rpc/reset_registration_data', {
    method: 'POST',
    body: '{}',
  });
}
