-- Lets admins drag a participant into any group, even one at or over capacity.
-- Self-registration still respects each group's capacity.
-- Safe to run repeatedly; it only replaces this function's body.
begin;

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

revoke all on function public.move_student_to_group(uuid, smallint) from public, anon, authenticated;
grant execute on function public.move_student_to_group(uuid, smallint) to service_role;

commit;
