-- QR-GAAP game engine. Run the whole file after the registration schema.
-- Extends the previously created game tables; never resets existing results.
begin;
select pg_advisory_xact_lock(505152, 2);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'game_type' and typnamespace = 'public'::regnamespace) then
    create type public.game_type as enum ('maze', 'charades');
  end if;
  if not exists (select 1 from pg_type where typname = 'game_state' and typnamespace = 'public'::regnamespace) then
    create type public.game_state as enum ('inactive', 'ready', 'running', 'ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'round_state' and typnamespace = 'public'::regnamespace) then
    create type public.round_state as enum ('pending', 'running', 'ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'attempt_result' and typnamespace = 'public'::regnamespace) then
    create type public.attempt_result as enum ('correct', 'skip');
  end if;
end $$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(), game_type public.game_type not null unique,
  state public.game_state not null default 'inactive', current_round_id uuid, updated_at timestamptz not null default now()
);
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id),
  round_number integer not null, state public.round_state not null default 'pending', duration_seconds integer,
  started_at timestamptz, deadline_at timestamptz, ended_at timestamptz, created_by uuid, created_at timestamptz not null default now(),
  unique (game_id, round_number)
);
create table if not exists public.maze_scoring_rules (place integer primary key check (place > 0), points integer not null check (points >= 0), updated_at timestamptz not null default now());
create table if not exists public.charades_settings (singleton boolean primary key default true check (singleton), duration_seconds integer not null default 600, correct_points integer not null default 1, skip_points integer not null default 0, updated_at timestamptz not null default now());
create table if not exists public.charades_words (id uuid primary key default gen_random_uuid(), word text not null, category text, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.charades_round_words (
  id uuid primary key default gen_random_uuid(), round_id uuid not null references public.game_rounds(id), group_id integer not null references public.groups(id),
  word_id uuid references public.charades_words(id), word_snapshot text not null, deck_position integer not null, created_at timestamptz not null default now()
);
create table if not exists public.maze_results (
  id uuid primary key default gen_random_uuid(), round_id uuid not null references public.game_rounds(id), group_id integer not null references public.groups(id),
  position integer not null check (position > 0), elapsed_ms bigint not null check (elapsed_ms >= 0), points_awarded integer not null default 0 check (points_awarded >= 0), finished_at timestamptz not null default now()
);
create table if not exists public.charades_attempts (
  id uuid primary key default gen_random_uuid(), round_id uuid not null references public.game_rounds(id), group_id integer not null references public.groups(id),
  round_word_id uuid not null, result public.attempt_result not null, points_awarded integer not null default 0, request_id uuid not null default gen_random_uuid(), attempted_at timestamptz not null default now()
);
create table if not exists public.score_adjustments (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id), round_id uuid references public.game_rounds(id),
  group_id integer not null references public.groups(id), points_delta integer not null, reason text not null, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, entity text not null, entity_id uuid,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

alter table public.games add column if not exists configuration jsonb not null default '{}';
alter table public.game_rounds add column if not exists configuration jsonb not null default '{}';
alter table public.game_rounds add column if not exists archived_at timestamptz;
alter table public.game_rounds add column if not exists end_reason text;
alter table public.game_rounds add column if not exists created_by_label text;
alter table public.charades_words add column if not exists sort_order integer not null default 0;
alter table public.maze_results add column if not exists recorded_by text;
alter table public.maze_results add column if not exists request_id uuid;
alter table public.charades_attempts add column if not exists recorded_by text;
alter table public.score_adjustments add column if not exists created_by_label text;
alter table public.score_adjustments add column if not exists request_id uuid;
alter table public.audit_log add column if not exists actor_label text;

create table if not exists public.game_round_groups (
  round_id uuid not null references public.game_rounds(id), group_id integer not null references public.groups(id),
  group_name text not null, primary key (round_id, group_id)
);
create table if not exists public.facilitator_credentials (
  group_id integer primary key references public.groups(id) on delete cascade,
  access_code_hash text not null check (access_code_hash ~ '^[0-9a-f]{64}$'),
  credential_version uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
create table if not exists public.game_action_receipts (
  request_id uuid primary key, action text not null, payload jsonb not null, response jsonb not null, created_at timestamptz not null default now()
);

create unique index if not exists gaap_one_running_game on public.games (state) where state = 'running';
create unique index if not exists gaap_game_type_unique on public.games(game_type);
create unique index if not exists gaap_round_number_unique on public.game_rounds(game_id, round_number);
create unique index if not exists gaap_maze_group_unique on public.maze_results(round_id, group_id);
create unique index if not exists gaap_maze_position_unique on public.maze_results(round_id, position);
create unique index if not exists gaap_maze_request_unique on public.maze_results(request_id) where request_id is not null;
create unique index if not exists gaap_word_unique on public.charades_words(lower(btrim(word)));
create unique index if not exists gaap_deck_position_unique on public.charades_round_words(round_id, group_id, deck_position);
create unique index if not exists gaap_deck_identity_unique on public.charades_round_words(round_id, group_id, id);
create unique index if not exists gaap_attempt_word_unique on public.charades_attempts(round_word_id);
create unique index if not exists gaap_attempt_request_unique on public.charades_attempts(request_id);
create unique index if not exists gaap_adjustment_request_unique on public.score_adjustments(request_id) where request_id is not null;
create index if not exists gaap_round_scores on public.game_rounds(game_id, archived_at);
create index if not exists gaap_attempt_progress on public.charades_attempts(round_id, group_id);
create index if not exists gaap_adjustment_scores on public.score_adjustments(round_id, group_id);
create index if not exists gaap_audit_recent on public.audit_log(created_at desc);
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'gaap_attempt_group_word_fk' and conrelid = 'public.charades_attempts'::regclass) then
    alter table public.charades_attempts add constraint gaap_attempt_group_word_fk foreign key(round_id, group_id, round_word_id) references public.charades_round_words(round_id, group_id, id);
  end if;
end $$;

-- Results remain the source of truth. This view is an adapter for new games;
-- adding a result source here does not require a new scoreboard calculation.
create or replace view public.gaap_game_score_events with (security_invoker = true) as
  select r.game_id, m.round_id, m.group_id, m.points_awarded::bigint points from public.maze_results m join public.game_rounds r on r.id = m.round_id where r.archived_at is null
  union all select r.game_id, a.round_id, a.group_id, a.points_awarded::bigint from public.charades_attempts a join public.game_rounds r on r.id = a.round_id where r.archived_at is null
  union all select r.game_id, a.round_id, a.group_id, a.points_delta::bigint from public.score_adjustments a join public.game_rounds r on r.id = a.round_id where r.archived_at is null;
revoke all on public.gaap_game_score_events from public, anon, authenticated;
grant select on public.gaap_game_score_events to service_role;

-- All reads and writes go through the authorized Next.js server, including words.
do $$ declare t text; begin
  foreach t in array array['games','game_rounds','maze_scoring_rules','charades_settings','charades_words','charades_round_words','maze_results','charades_attempts','score_adjustments','audit_log','game_round_groups','facilitator_credentials','game_action_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
-- Previously created public views remain inaccessible through browser keys.
do $$ declare t text; begin
  foreach t in array array['public_game_status','game_scoreboard'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;

insert into public.games(game_type) values ('maze'), ('charades') on conflict (game_type) do nothing;
insert into public.charades_settings(singleton, duration_seconds, correct_points, skip_points) values (true, 600, 1, 0) on conflict (singleton) do nothing;
insert into public.maze_scoring_rules(place, points)
select n, greatest(0, 100 - (n - 1) * 10) from generate_series(1, greatest(1, (select count(*)::integer from public.groups))) n
where not exists (select 1 from public.maze_scoring_rules)
on conflict (place) do nothing;

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

create or replace function public.gaap_placement_points(p_config jsonb, p_position integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(0, coalesce((p_config -> 'placements' ->> (p_position - 1))::integer, (p_config ->> 'fallback')::integer, 0));
$$;

create or replace function public.gaap_admin_command(p_game_type text, p_action text, p_payload jsonb, p_request_id uuid, p_actor text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.games%rowtype; r public.game_rounds%rowtype; before_value jsonb; result jsonb; receipt public.game_action_receipts%rowtype;
  n integer; v integer; item jsonb; reason text; finish public.maze_results%rowtype; attempt public.charades_attempts%rowtype; positions jsonb; offset_position integer; started_time timestamptz;
begin
  perform pg_advisory_xact_lock(505152, 2);
  if p_request_id is null or p_actor is null or p_actor not like 'admin:%' then
    return jsonb_build_object('success', false, 'status', 403, 'message', 'Admin access required.');
  end if;
  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then return jsonb_build_object('success', false, 'status', 400, 'message', 'Invalid game request.'); end if;
  select * into receipt from public.game_action_receipts where request_id = p_request_id;
  if found then
    if receipt.action <> p_action or receipt.payload <> jsonb_build_object('game', p_game_type, 'data', p_payload, 'actor', p_actor) then
      return jsonb_build_object('success', false, 'status', 409, 'message', 'This request ID was already used for another action.');
    end if;
    return receipt.response;
  end if;
  perform public.gaap_expire_games();
  select * into g from public.games where game_type::text = p_game_type for update;
  if not found then return jsonb_build_object('success', false, 'status', 404, 'message', 'Game not found.'); end if;
  select * into r from public.game_rounds where id = g.current_round_id;
  before_value := to_jsonb(g);
  if p_action in ('settings','words') and p_payload ? 'expectedVersion' and (p_payload ->> 'expectedVersion')::timestamptz is distinct from g.updated_at then
    return jsonb_build_object('success', false, 'status', 409, 'message', 'These settings changed in another session. Discard your draft, reload, and try again.');
  end if;
  if p_action in ('prepare','start','end','reset') and coalesce(p_payload ->> 'expectedRoundId', '') <> coalesce(g.current_round_id::text, '') then
    return jsonb_build_object('success', false, 'status', 409, 'message', 'The round changed. Refresh before trying again.');
  end if;

  if p_action = 'prepare' then
    if g.state not in ('inactive','ended') then return jsonb_build_object('success', false, 'status', 409, 'message', 'Only an inactive or ended game can be prepared.'); end if;
    insert into public.game_rounds(game_id, round_number, created_by_label)
    select g.id, coalesce(max(round_number), 0) + 1, p_actor from public.game_rounds where game_id = g.id returning * into r;
    update public.games set state = 'ready', current_round_id = r.id, updated_at = clock_timestamp() where id = g.id;
  elsif p_action = 'start' then
    if g.state <> 'ready' or r.id is null or r.state <> 'pending' then return jsonb_build_object('success', false, 'status', 409, 'message', 'Prepare this game before starting it.'); end if;
    if exists (select 1 from public.games where state = 'running') then return jsonb_build_object('success', false, 'status', 409, 'message', 'End the running game before starting another.'); end if;
    if not exists (select 1 from public.groups) then return jsonb_build_object('success', false, 'status', 409, 'message', 'Create groups before starting a game.'); end if;
    if g.game_type = 'charades' and not exists (select 1 from public.charades_words where active) then return jsonb_build_object('success', false, 'status', 409, 'message', 'Add Charades words before starting.'); end if;
    insert into public.game_round_groups(round_id, group_id, group_name) select r.id, id, name from public.groups;
    if g.game_type = 'maze' then
      select jsonb_build_object('placements', jsonb_agg(points order by place), 'fallback', coalesce((g.configuration ->> 'fallback')::integer, 0)) into positions from public.maze_scoring_rules;
      update public.game_rounds set state = 'running', started_at = clock_timestamp(), configuration = positions where id = r.id;
    else
      select duration_seconds, correct_points into n, v from public.charades_settings where singleton;
      started_time := clock_timestamp();
      update public.game_rounds set state = 'running', started_at = started_time, duration_seconds = n,
        deadline_at = started_time + make_interval(secs => n), configuration = jsonb_build_object('durationSeconds', n, 'correctPoints', v, 'skipPoints', 0) where id = r.id;
      insert into public.charades_round_words(round_id, group_id, word_id, word_snapshot, deck_position)
      select r.id, rg.group_id, w.id, w.word, w.position from public.game_round_groups rg
      cross join (select id, word, row_number() over(order by sort_order, created_at, id)::integer position from public.charades_words where active) w where rg.round_id = r.id;
    end if;
    update public.games set state = 'running', updated_at = clock_timestamp() where id = g.id;
  elsif p_action = 'end' then
    if g.state <> 'running' then return jsonb_build_object('success', false, 'status', 409, 'message', 'Only a running game can be ended.'); end if;
    update public.game_rounds set state = 'ended', ended_at = clock_timestamp(), end_reason = 'manual' where id = r.id;
    update public.games set state = 'ended', updated_at = clock_timestamp() where id = g.id;
  elsif p_action = 'reset' then
    if p_payload -> 'confirmed' is distinct from 'true'::jsonb then return jsonb_build_object('success', false, 'status', 400, 'message', 'Confirm the reset before continuing.'); end if;
    if g.state = 'running' then update public.game_rounds set state = 'ended', ended_at = clock_timestamp(), end_reason = 'reset' where id = r.id; end if;
    update public.game_rounds set archived_at = clock_timestamp() where game_id = g.id and archived_at is null;
    update public.games set state = 'inactive', current_round_id = null, updated_at = clock_timestamp() where id = g.id;
  elsif p_action = 'settings' then
    if g.state = 'running' then return jsonb_build_object('success', false, 'status', 409, 'message', 'End the game before changing its settings.'); end if;
    if g.game_type = 'maze' then
      before_value := jsonb_build_object('placements', (select jsonb_agg(points order by place) from public.maze_scoring_rules), 'fallback', coalesce((g.configuration ->> 'fallback')::integer, 0));
      if coalesce(jsonb_typeof(p_payload -> 'placements'), '') <> 'array' or jsonb_array_length(p_payload -> 'placements') not between 1 and 100 then return jsonb_build_object('success', false, 'status', 400, 'message', 'Enter between 1 and 100 placement scores.'); end if;
      for item in select value from jsonb_array_elements(p_payload -> 'placements') loop
        if item::text !~ '^[0-9]{1,6}$' or item::integer > 100000 then return jsonb_build_object('success', false, 'status', 400, 'message', 'Placement points must be whole numbers from 0 to 100000.'); end if;
      end loop;
      if coalesce(p_payload ->> 'fallback', '') !~ '^[0-9]{1,6}$' or (p_payload ->> 'fallback')::integer > 100000 then return jsonb_build_object('success', false, 'status', 400, 'message', 'Fallback points must be nonnegative.'); end if;
      delete from public.maze_scoring_rules;
      insert into public.maze_scoring_rules(place, points) select ordinality::integer, value::integer from jsonb_array_elements(p_payload -> 'placements') with ordinality;
      update public.games set configuration = jsonb_build_object('fallback', (p_payload ->> 'fallback')::integer), updated_at = clock_timestamp() where id = g.id;
    else
      if coalesce(p_payload ->> 'durationSeconds', '') !~ '^[0-9]{1,5}$' or (p_payload ->> 'durationSeconds')::integer not between 10 and 7200 or
        coalesce(p_payload ->> 'correctPoints', '') !~ '^[0-9]{1,6}$' or (p_payload ->> 'correctPoints')::integer > 100000 then
        return jsonb_build_object('success', false, 'status', 400, 'message', 'Duration must be 10–7200 seconds and correct points must be nonnegative.');
      end if;
      before_value := (select jsonb_build_object('durationSeconds', duration_seconds, 'correctPoints', correct_points, 'skipPoints', skip_points) from public.charades_settings where singleton);
      update public.charades_settings set duration_seconds = (p_payload ->> 'durationSeconds')::integer, correct_points = (p_payload ->> 'correctPoints')::integer, skip_points = 0, updated_at = clock_timestamp() where singleton;
      update public.games set updated_at = clock_timestamp() where id = g.id;
    end if;
  elsif p_action = 'words' then
    if g.game_type <> 'charades' or g.state = 'running' then return jsonb_build_object('success', false, 'status', 409, 'message', 'End Charades before editing its word deck.'); end if;
    if coalesce(jsonb_typeof(p_payload -> 'words'), '') <> 'array' or jsonb_array_length(p_payload -> 'words') > 1000 then return jsonb_build_object('success', false, 'status', 400, 'message', 'Enter at most 1000 words.'); end if;
    if exists (select 1 from jsonb_array_elements_text(p_payload -> 'words') w where length(btrim(w)) not between 1 and 100) then return jsonb_build_object('success', false, 'status', 400, 'message', 'Words must contain 1–100 characters.'); end if;
    if (select count(*) from jsonb_array_elements_text(p_payload -> 'words')) <> (select count(distinct lower(btrim(w))) from jsonb_array_elements_text(p_payload -> 'words') w) then return jsonb_build_object('success', false, 'status', 400, 'message', 'Remove duplicate words before saving.'); end if;
    before_value := (select coalesce(jsonb_agg(word order by sort_order, created_at, id), '[]') from public.charades_words where active);
    update public.charades_words set active = false where active;
    insert into public.charades_words(word, active, sort_order)
    select btrim(value), true, ordinality::integer from jsonb_array_elements_text(p_payload -> 'words') with ordinality
    on conflict (lower(btrim(word))) do update set word = excluded.word, active = true, sort_order = excluded.sort_order;
    update public.games set updated_at = clock_timestamp() where id = g.id;
  elsif p_action = 'group_code' then
    if coalesce(p_payload ->> 'groupId', '') !~ '^[0-9]+$' or not exists(select 1 from public.groups where id = (p_payload ->> 'groupId')::integer) then return jsonb_build_object('success', false, 'status', 404, 'message', 'Group not found.'); end if;
    if coalesce(p_payload ->> 'hash', '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('success', false, 'status', 400, 'message', 'Invalid access code.'); end if;
    insert into public.facilitator_credentials(group_id, access_code_hash, credential_version) values ((p_payload ->> 'groupId')::integer, p_payload ->> 'hash', (p_payload ->> 'version')::uuid)
    on conflict (group_id) do update set access_code_hash = excluded.access_code_hash, credential_version = excluded.credential_version, updated_at = clock_timestamp();
    before_value := null;
  elsif p_action = 'maze_undo' then
    reason := btrim(coalesce(p_payload ->> 'reason', ''));
    if g.game_type <> 'maze' or length(reason) not between 1 and 300 then return jsonb_build_object('success', false, 'status', 400, 'message', 'A correction reason is required.'); end if;
    select * into finish from public.maze_results where id = (p_payload ->> 'resultId')::uuid and round_id = r.id;
    if not found then return jsonb_build_object('success', false, 'status', 409, 'message', 'That finish is no longer in this round.'); end if;
    before_value := jsonb_build_object('removed', to_jsonb(finish), 'ranking', (select jsonb_agg(to_jsonb(m) order by position) from public.maze_results m where round_id = r.id));
    delete from public.maze_results where id = finish.id;
    select coalesce(max(position), 0) + 1000 into offset_position from public.maze_results where round_id = r.id;
    update public.maze_results set position = position + offset_position where round_id = r.id;
    with ordered as (select id, row_number() over(order by position, id)::integer pos from public.maze_results where round_id = r.id)
    update public.maze_results m set position = o.pos, points_awarded = public.gaap_placement_points(r.configuration, o.pos) from ordered o where o.id = m.id;
  elsif p_action = 'charades_correct' then
    reason := btrim(coalesce(p_payload ->> 'reason', ''));
    if g.game_type <> 'charades' or length(reason) not between 1 and 300 or coalesce(p_payload ->> 'result', '') not in ('correct','skip') then return jsonb_build_object('success', false, 'status', 400, 'message', 'Choose an outcome and enter a correction reason.'); end if;
    select * into attempt from public.charades_attempts where id = (p_payload ->> 'attemptId')::uuid and round_id = r.id;
    if not found or attempt.result::text <> coalesce(p_payload ->> 'expectedResult', '') then return jsonb_build_object('success', false, 'status', 409, 'message', 'This answer changed. Refresh before correcting it.'); end if;
    before_value := to_jsonb(attempt);
    update public.charades_attempts set result = (p_payload ->> 'result')::public.attempt_result,
      points_awarded = case when p_payload ->> 'result' = 'correct' then coalesce((r.configuration ->> 'correctPoints')::integer, 1) else 0 end where id = attempt.id;
  elsif p_action = 'adjust' then
    reason := btrim(coalesce(p_payload ->> 'reason', ''));
    if r.id is null or r.archived_at is not null or coalesce(p_payload ->> 'roundId', '') <> r.id::text or length(reason) not between 1 and 300 or
      coalesce(p_payload ->> 'amount', '') !~ '^-?[0-9]{1,5}$' or abs((p_payload ->> 'amount')::integer) > 10000 or
      not exists(select 1 from public.game_round_groups where round_id = r.id and group_id = (p_payload ->> 'groupId')::integer) then
      return jsonb_build_object('success', false, 'status', 400, 'message', 'Select an eligible group, a score change within ±10000, and a reason.');
    end if;
    insert into public.score_adjustments(game_id, round_id, group_id, points_delta, reason, created_by_label, request_id)
    values(g.id, r.id, (p_payload ->> 'groupId')::integer, (p_payload ->> 'amount')::integer, reason, p_actor, p_request_id);
  else
    return jsonb_build_object('success', false, 'status', 400, 'message', 'Unknown game action.');
  end if;
  result := jsonb_build_object('success', true, 'message', 'Changes saved.');
  insert into public.audit_log(action, entity, entity_id, actor_label, before_data, after_data)
  values ('gaap.' || p_action, 'game', g.id, p_actor, before_value,
    case when p_action = 'group_code' then jsonb_build_object('groupId', p_payload -> 'groupId', 'rotated', true)
      when p_action = 'maze_undo' then jsonb_build_object('reason', reason, 'ranking', (select coalesce(jsonb_agg(to_jsonb(m) order by position), '[]') from public.maze_results m where round_id = r.id))
      when p_action = 'charades_correct' then jsonb_build_object('reason', reason, 'attempt', (select to_jsonb(a) from public.charades_attempts a where id = attempt.id))
      else p_payload end);
  insert into public.game_action_receipts(request_id, action, payload, response) values (p_request_id, p_action, jsonb_build_object('game', p_game_type, 'data', p_payload, 'actor', p_actor), result);
  return result;
end $$;

create or replace function public.gaap_finish_maze(p_round_id uuid, p_group_id integer, p_request_id uuid, p_credential_version uuid, p_actor text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.games%rowtype; r public.game_rounds%rowtype; finish public.maze_results%rowtype; received_at timestamptz; pos integer; receipt public.game_action_receipts%rowtype; request_payload jsonb; result jsonb;
begin
  perform pg_advisory_xact_lock(505152, 2);
  if p_request_id is null or not exists(select 1 from public.facilitator_credentials where group_id = p_group_id and credential_version = p_credential_version) then return jsonb_build_object('success', false, 'status', 403, 'message', 'Group access expired. Enter the current facilitator code.'); end if;
  request_payload := jsonb_build_object('roundId', p_round_id, 'groupId', p_group_id);
  select * into receipt from public.game_action_receipts where request_id = p_request_id;
  if found then
    if receipt.action <> 'maze_finish' or receipt.payload <> request_payload then return jsonb_build_object('success', false, 'status', 409, 'message', 'This request ID was already used for another action.'); end if;
    return receipt.response;
  end if;
  select * into finish from public.maze_results where request_id = p_request_id;
  if found and (finish.round_id <> p_round_id or finish.group_id <> p_group_id) then return jsonb_build_object('success', false, 'status', 409, 'message', 'This request ID was already used for another finish.'); end if;
  select * into finish from public.maze_results where round_id = p_round_id and group_id = p_group_id;
  if found then return jsonb_build_object('success', true, 'duplicate', true, 'record', to_jsonb(finish)); end if;
  perform public.gaap_expire_games();
  select * into g from public.games where game_type = 'maze';
  select * into r from public.game_rounds where id = p_round_id for update;
  if g.current_round_id is distinct from p_round_id or g.state <> 'running' or r.state <> 'running' or r.archived_at is not null then return jsonb_build_object('success', false, 'status', 409, 'message', 'Maze is not running for this round.'); end if;
  if not exists(select 1 from public.game_round_groups where round_id = r.id and group_id = p_group_id) then return jsonb_build_object('success', false, 'status', 404, 'message', 'This group is not part of the current round.'); end if;
  received_at := clock_timestamp();
  select count(*)::integer + 1 into pos from public.maze_results where round_id = r.id;
  insert into public.maze_results(round_id, group_id, position, elapsed_ms, points_awarded, finished_at, recorded_by, request_id)
  values(r.id, p_group_id, pos, greatest(0, floor(extract(epoch from (received_at - r.started_at)) * 1000)::bigint), public.gaap_placement_points(r.configuration, pos), received_at, p_actor, p_request_id) returning * into finish;
  insert into public.audit_log(action, entity, entity_id, actor_label, after_data) values('gaap.maze_finish', 'maze_result', finish.id, p_actor, to_jsonb(finish));
  result := jsonb_build_object('success', true, 'record', to_jsonb(finish));
  insert into public.game_action_receipts(request_id, action, payload, response) values(p_request_id, 'maze_finish', request_payload, result);
  return result;
end $$;

create or replace function public.gaap_charades_answer(p_round_id uuid, p_group_id integer, p_word_id uuid, p_result text, p_request_id uuid, p_credential_version uuid, p_actor text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.games%rowtype; r public.game_rounds%rowtype; attempt public.charades_attempts%rowtype; word_id uuid; received_at timestamptz; receipt public.game_action_receipts%rowtype; request_payload jsonb; result jsonb;
begin
  perform pg_advisory_xact_lock(505152, 2);
  if p_request_id is null or p_result is null or p_result not in ('correct','skip') then return jsonb_build_object('success', false, 'status', 400, 'message', 'Invalid answer.'); end if;
  if not exists(select 1 from public.facilitator_credentials where group_id = p_group_id and credential_version = p_credential_version) then return jsonb_build_object('success', false, 'status', 403, 'message', 'Group access expired. Enter the current facilitator code.'); end if;
  request_payload := jsonb_build_object('roundId', p_round_id, 'groupId', p_group_id, 'wordId', p_word_id, 'result', p_result);
  select * into receipt from public.game_action_receipts where request_id = p_request_id;
  if found then
    if receipt.action <> 'charades_answer' or receipt.payload <> request_payload then return jsonb_build_object('success', false, 'status', 409, 'message', 'This request ID was already used for another action.'); end if;
    return receipt.response;
  end if;
  select * into attempt from public.charades_attempts where request_id = p_request_id;
  if found and (attempt.round_id <> p_round_id or attempt.group_id <> p_group_id or attempt.round_word_id <> p_word_id or attempt.result::text <> p_result) then return jsonb_build_object('success', false, 'status', 409, 'message', 'This request ID was already used for another answer.'); end if;
  select * into attempt from public.charades_attempts where round_word_id = p_word_id and round_id = p_round_id and group_id = p_group_id;
  if found then return jsonb_build_object('success', true, 'duplicate', true, 'record', to_jsonb(attempt)); end if;
  perform public.gaap_expire_games();
  select * into g from public.games where game_type = 'charades';
  select * into r from public.game_rounds where id = p_round_id for update;
  received_at := clock_timestamp();
  if g.current_round_id is distinct from p_round_id or g.state <> 'running' or r.state <> 'running' or r.archived_at is not null or received_at >= r.deadline_at then return jsonb_build_object('success', false, 'status', 409, 'message', 'Charades is not running or time is up.'); end if;
  if not exists(select 1 from public.game_round_groups where round_id = r.id and group_id = p_group_id) then return jsonb_build_object('success', false, 'status', 404, 'message', 'This group is not part of the current round.'); end if;
  select w.id into word_id from public.charades_round_words w left join public.charades_attempts a on a.round_word_id = w.id
  where w.round_id = r.id and w.group_id = p_group_id and a.id is null order by w.deck_position limit 1;
  if word_id is null then return jsonb_build_object('success', false, 'status', 409, 'message', 'All words have been attempted.'); end if;
  if word_id <> p_word_id then return jsonb_build_object('success', false, 'status', 409, 'message', 'The word changed in another tab. Refresh before answering.'); end if;
  insert into public.charades_attempts(round_id, group_id, round_word_id, result, points_awarded, request_id, attempted_at, recorded_by)
  values(r.id, p_group_id, word_id, p_result::public.attempt_result, case when p_result = 'correct' then coalesce((r.configuration ->> 'correctPoints')::integer, 1) else 0 end, p_request_id, received_at, p_actor) returning * into attempt;
  insert into public.audit_log(action, entity, entity_id, actor_label, after_data) values('gaap.charades_' || p_result, 'charades_attempt', attempt.id, p_actor, to_jsonb(attempt));
  result := jsonb_build_object('success', true, 'record', to_jsonb(attempt));
  insert into public.game_action_receipts(request_id, action, payload, response) values(p_request_id, 'charades_answer', request_payload, result);
  return result;
end $$;

create or replace function public.gaap_game_snapshot(p_group_id integer default null, p_admin boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; extra jsonb; charades_round uuid;
begin
  perform public.gaap_expire_games();
  select current_round_id into charades_round from public.games where game_type = 'charades';
  result := jsonb_build_object(
    'serverNow', clock_timestamp(),
    'games', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'type', g.game_type, 'name', case when g.game_type = 'maze' then 'Maze Game' when g.game_type = 'charades' then 'Charades' else initcap(g.game_type::text) end, 'state', g.state, 'updatedAt', g.updated_at,
      'currentRound', case when r.id is null then null else jsonb_build_object('id', r.id, 'number', r.round_number, 'state', r.state, 'startedAt', r.started_at, 'endAt', r.deadline_at, 'endedAt', r.ended_at, 'endReason', r.end_reason, 'configuration', r.configuration) end) order by g.game_type), '[]') from public.games g left join public.game_rounds r on r.id = g.current_round_id),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('groupId', gr.id, 'name', gr.name,
      'eligibleRounds', (select coalesce(jsonb_agg(rg.round_id), '[]') from public.game_round_groups rg join public.games g on g.current_round_id = rg.round_id where rg.group_id = gr.id),
      'maze', (select jsonb_build_object('id', m.id, 'position', m.position, 'elapsedMs', m.elapsed_ms, 'points', m.points_awarded, 'finishedAt', m.finished_at) from public.maze_results m join public.games g on g.current_round_id = m.round_id and g.game_type = 'maze' where m.group_id = gr.id),
      'charades', jsonb_build_object('correct', (select count(*) from public.charades_attempts a where a.round_id = charades_round and a.group_id = gr.id and a.result = 'correct'),
        'skipped', (select count(*) from public.charades_attempts a where a.round_id = charades_round and a.group_id = gr.id and a.result = 'skip'),
        'points', (select coalesce(sum(points_awarded), 0) from public.charades_attempts a where a.round_id = charades_round and a.group_id = gr.id) + (select coalesce(sum(points_delta), 0) from public.score_adjustments a where a.round_id = charades_round and a.group_id = gr.id),
        'totalWords', (select count(*) from public.charades_round_words w where w.round_id = charades_round and w.group_id = gr.id))) order by gr.id), '[]') from public.groups gr),
    'scoreboard', (select coalesce(jsonb_agg(jsonb_build_object('groupId', gr.id, 'name', gr.name,
      'gameScores', scores.game_scores,
      'totalScore', scores.total_score,
      'charadesCorrect', coalesce(cs.correct, 0), 'mazePosition', ms.position, 'mazeElapsedMs', ms.elapsed) order by gr.id), '[]')
      from public.groups gr
      left join lateral (select sum(m.points_awarded) points, min(m.position) position, min(m.elapsed_ms) elapsed from public.maze_results m join public.game_rounds r on r.id = m.round_id and r.archived_at is null where m.group_id = gr.id) ms on true
      left join lateral (select sum(a.points_awarded) points, count(*) filter(where a.result = 'correct') correct from public.charades_attempts a join public.game_rounds r on r.id = a.round_id and r.archived_at is null where a.group_id = gr.id) cs on true
      left join lateral (select jsonb_object_agg(s.game_type, s.points) game_scores, sum(s.points) total_score from
        (select g.game_type::text game_type, coalesce(sum(e.points), 0) points from public.games g left join public.gaap_game_score_events e on e.game_id = g.id and e.group_id = gr.id group by g.game_type) s) scores on true)
  );
  if p_group_id is not null then
    extra := jsonb_build_object('groupId', p_group_id, 'currentWord',
      (select jsonb_build_object('id', w.id, 'word', w.word_snapshot, 'position', w.deck_position) from public.charades_round_words w
        join public.games g on g.current_round_id = w.round_id and g.state = 'running' left join public.charades_attempts a on a.round_word_id = w.id
        where w.group_id = p_group_id and a.id is null order by w.deck_position limit 1));
    result := result || jsonb_build_object('facilitator', extra);
  end if;
  if p_admin then
    result := result || jsonb_build_object('admin', jsonb_build_object(
      'maze', jsonb_build_object('placements', (select jsonb_agg(points order by place) from public.maze_scoring_rules), 'fallback', (select coalesce((configuration ->> 'fallback')::integer, 0) from public.games where game_type = 'maze')),
      'charades', (select jsonb_build_object('durationSeconds', duration_seconds, 'correctPoints', correct_points) from public.charades_settings where singleton),
      'words', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', word, 'sortOrder', sort_order) order by sort_order, created_at, id), '[]') from public.charades_words where active),
      'facilitators', (select coalesce(jsonb_agg(jsonb_build_object('groupId', group_id, 'updatedAt', updated_at)), '[]') from public.facilitator_credentials),
      'attempts', (select coalesce(jsonb_agg(to_jsonb(recent) order by recent."attemptedAt" desc), '[]') from (select a.id, a.group_id "groupId", w.word_snapshot word, a.result, a.points_awarded points, a.attempted_at "attemptedAt" from public.charades_attempts a join public.charades_round_words w on w.id = a.round_word_id where a.round_id = charades_round order by a.attempted_at desc, a.id desc limit 25) recent),
      'audit', (select coalesce(jsonb_agg(to_jsonb(log) order by log.created_at desc), '[]') from (select id, action, actor_label, created_at, before_data, after_data from public.audit_log where action like 'gaap.%' order by created_at desc limit 50) log)
    ));
  end if;
  return result;
end $$;

create or replace function public.gaap_charades_history(p_group_id integer, p_before timestamptz default null, p_before_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  with page as (
    select a.id, a.group_id "groupId", w.word_snapshot word, a.result, a.points_awarded points, a.attempted_at "attemptedAt"
    from public.charades_attempts a join public.games g on g.current_round_id = a.round_id and g.game_type = 'charades'
    join public.charades_round_words w on w.id = a.round_word_id
    where a.group_id = p_group_id and (p_before is null or (a.attempted_at, a.id) < (p_before, p_before_id))
    order by a.attempted_at desc, a.id desc limit 51
  ), visible as (select * from page order by "attemptedAt" desc, id desc limit 50)
  select jsonb_build_object('roundId', (select current_round_id from public.games where game_type = 'charades'), 'attempts', (select coalesce(jsonb_agg(to_jsonb(v) order by "attemptedAt" desc, id desc), '[]') from visible v),
    'cursor', case when (select count(*) from page) > 50 then (select jsonb_build_object('at', "attemptedAt", 'id', id) from visible order by "attemptedAt", id limit 1) else null end);
$$;

revoke all on function public.gaap_expire_games() from public, anon, authenticated;
revoke all on function public.gaap_placement_points(jsonb, integer) from public, anon, authenticated;
revoke all on function public.gaap_admin_command(text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.gaap_finish_maze(uuid, integer, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.gaap_charades_answer(uuid, integer, uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.gaap_game_snapshot(integer, boolean) from public, anon, authenticated;
revoke all on function public.gaap_charades_history(integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.gaap_expire_games(), public.gaap_placement_points(jsonb, integer), public.gaap_admin_command(text, text, jsonb, uuid, text), public.gaap_finish_maze(uuid, integer, uuid, uuid, text), public.gaap_charades_answer(uuid, integer, uuid, text, uuid, uuid, text), public.gaap_game_snapshot(integer, boolean), public.gaap_charades_history(integer, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
