-- QR-GAAP runtime functions used by the current registration/admin APIs.
-- Run this after the base tables from the Supabase setup SQL have been created.

-- Recreate this RPC to repair an older function whose parameter names do not
-- match the JSON keys sent by the current app.
drop function if exists public.register_participant(text, text, text);

create or replace function public.register_participant(
  p_name text,
  p_student_number text default null,
  p_card_tag text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  clean_name text := trim(coalesce(p_name, ''));
  clean_student_number text := nullif(trim(coalesce(p_student_number, '')), '');
  clean_card_tag text := nullif(trim(coalesce(p_card_tag, '')), '');
  chosen_group_id smallint;
  participant public.students%rowtype;
  result_message text;
begin
  if clean_name = '' or length(clean_name) > 100 then
    return jsonb_build_object('success', false, 'message', 'Participant name is required and must be 100 characters or fewer.');
  end if;

  -- Serialize registration, group moves, capacity edits and deletes so two
  -- requests cannot overfill a group or assign the same identifier twice.
  perform pg_advisory_xact_lock(505152, 1);

  select s.* into participant
  from public.students s
  where (clean_student_number is not null and (
      lower(trim(coalesce(s.student_number, ''))) = lower(clean_student_number)
      or upper(trim(coalesce(s.card_tag, ''))) = upper(clean_student_number)
    ))
    or (clean_card_tag is not null and (
      lower(trim(coalesce(s.student_number, ''))) = lower(clean_card_tag)
      or upper(trim(coalesce(s.card_tag, ''))) = upper(clean_card_tag)
    ))
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'student', jsonb_build_object(
        'id', participant.id,
        'name', participant.name,
        'studentNumber', coalesce(participant.student_number, participant.card_tag, ''),
        'groupId', participant.group_id,
        'timestamp', participant.joined_at
      ),
      'message', 'You have already joined a group.'
    );
  end if;

  select g.id into chosen_group_id
  from public.groups g
  left join lateral (
    select count(*)::integer as member_count
    from public.students s
    where s.group_id = g.id
  ) counts on true
  where coalesce(counts.member_count, 0) < g.capacity
  order by coalesce(counts.member_count, 0), g.id
  limit 1;

  if chosen_group_id is null then
    if exists (select 1 from public.groups) then
      return jsonb_build_object('success', false, 'message', 'All groups are at maximum capacity.');
    end if;
    return jsonb_build_object('success', false, 'message', 'No groups are available.');
  end if;

  insert into public.students (name, student_number, card_tag, group_id)
  values (clean_name, clean_student_number, clean_card_tag, chosen_group_id)
  returning * into participant;

  result_message := 'Successfully assigned to a group!';
  return jsonb_build_object(
    'success', true,
    'student', jsonb_build_object(
      'id', participant.id,
      'name', participant.name,
      'studentNumber', coalesce(participant.student_number, participant.card_tag, ''),
      'groupId', participant.group_id,
      'timestamp', participant.joined_at
    ),
    'message', result_message
  );
end;
$$;

create or replace function public.move_student_to_group(
  p_student_id uuid,
  p_new_group_id smallint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  participant public.students%rowtype;
begin
  perform pg_advisory_xact_lock(505152, 1);

  select * into participant from public.students where id = p_student_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Student not found.');
  end if;

  if not exists (select 1 from public.groups where id = p_new_group_id) then
    return jsonb_build_object('success', false, 'message', 'Target group not found.');
  end if;

  if participant.group_id = p_new_group_id then
    return jsonb_build_object('success', true);
  end if;

  -- Admin moves deliberately ignore group capacity; only self-registration is capped.
  update public.students set group_id = p_new_group_id where id = p_student_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_participant(p_student_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform pg_advisory_xact_lock(505152, 1);
  delete from public.students where id = p_student_id;
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('success', deleted_count > 0);
end;
$$;

create or replace function public.delete_group_with_members(p_group_id smallint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform pg_advisory_xact_lock(505152, 1);

  if not exists (select 1 from public.groups where id = p_group_id) then
    return jsonb_build_object('success', false, 'message', 'Group not found.');
  end if;

  begin
    delete from public.students where group_id = p_group_id;
    delete from public.groups where id = p_group_id;
    get diagnostics deleted_count = row_count;
  exception when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'This group is referenced by game data and cannot be deleted.');
  end;

  return jsonb_build_object('success', deleted_count > 0);
end;
$$;

create or replace function public.update_group_capacity(
  p_group_id smallint,
  p_capacity integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if p_capacity is null or p_capacity < 1 then
    return jsonb_build_object('success', false, 'message', 'Capacity must be at least 1.');
  end if;

  perform pg_advisory_xact_lock(505152, 1);
  update public.groups set capacity = p_capacity where id = p_group_id;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    return jsonb_build_object('success', false, 'message', 'Group not found.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.reset_registration_data()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform pg_advisory_xact_lock(505152, 1);
  delete from public.students;
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('success', true, 'deleted', deleted_count);
end;
$$;

revoke all on function public.register_participant(text, text, text) from public, anon, authenticated;
revoke all on function public.move_student_to_group(uuid, smallint) from public, anon, authenticated;
revoke all on function public.delete_participant(uuid) from public, anon, authenticated;
revoke all on function public.delete_group_with_members(smallint) from public, anon, authenticated;
revoke all on function public.update_group_capacity(smallint, integer) from public, anon, authenticated;
revoke all on function public.reset_registration_data() from public, anon, authenticated;

grant execute on function public.register_participant(text, text, text) to service_role;
grant execute on function public.move_student_to_group(uuid, smallint) to service_role;
grant execute on function public.delete_participant(uuid) to service_role;
grant execute on function public.delete_group_with_members(smallint) to service_role;
grant execute on function public.update_group_capacity(smallint, integer) to service_role;
grant execute on function public.reset_registration_data() to service_role;

-- Make the RPC definitions available to PostgREST immediately after commit.
notify pgrst, 'reload schema';
