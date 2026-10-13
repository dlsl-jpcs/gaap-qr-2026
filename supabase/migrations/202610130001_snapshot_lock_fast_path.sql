-- Lets game snapshots (polled by every open scoreboard/display) run concurrently.
-- Previously every snapshot took the global game lock for its whole transaction,
-- so all readers and facilitator actions were processed one at a time.
-- Safe to run repeatedly; it only replaces this function's body.
begin;

create or replace function public.gaap_expire_games()
returns void language plpgsql security invoker set search_path = '' as $$
declare r record; deadline timestamptz;
begin
  -- Snapshots call this on every poll. Take the game lock only when a round is
  -- actually due, so concurrent readers do not queue behind each other or writers.
  if not exists (select 1 from public.games g join public.game_rounds gr on gr.id = g.current_round_id
    where g.game_type = 'charades' and g.state = 'running' and gr.deadline_at <= clock_timestamp()) then return; end if;
  perform pg_advisory_xact_lock(505152, 2);
  for r in select gr.id, gr.deadline_at, g.id game_id from public.game_rounds gr join public.games g on g.current_round_id = gr.id
    where g.game_type = 'charades' and g.state = 'running' and gr.deadline_at <= clock_timestamp() loop
    deadline := r.deadline_at;
    update public.game_rounds set state = 'ended', ended_at = deadline, end_reason = 'timer' where id = r.id;
    update public.games set state = 'ended', updated_at = clock_timestamp() where id = r.game_id;
    insert into public.audit_log(action, entity, entity_id, actor_label, after_data)
    values ('gaap.timer_expired', 'game_round', r.id, 'system', jsonb_build_object('endedAt', deadline));
  end loop;
end $$;

revoke all on function public.gaap_expire_games() from public, anon, authenticated;
grant execute on function public.gaap_expire_games() to service_role;

notify pgrst, 'reload schema';
commit;
