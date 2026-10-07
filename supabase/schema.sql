-- QR-GAAP registration tables only. This does not create the later game system.
-- Safe to run repeatedly when these tables do not already exist.

create table if not exists public.groups (
  id smallint primary key check (id between 1 and 14),
  name text not null,
  capacity integer not null default 20 check (capacity >= 1)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  student_number text,
  card_tag text,
  group_id smallint not null references public.groups(id),
  joined_at timestamptz not null default now()
);

create unique index if not exists students_student_number_unique
  on public.students (lower(trim(student_number)))
  where student_number is not null and trim(student_number) <> '';

create unique index if not exists students_card_tag_unique
  on public.students (upper(trim(card_tag)))
  where card_tag is not null and trim(card_tag) <> '';

create table if not exists public.event_settings (
  singleton boolean primary key default true check (singleton),
  registration_mode text not null default 'studentNumber'
    check (registration_mode in ('nfc', 'studentNumber', 'manualName')),
  updated_at timestamptz not null default now()
);

insert into public.groups (id, name, capacity)
select group_id, 'Group ' || lpad(group_id::text, 2, '0'), 20
from generate_series(1, 14) as group_id
on conflict (id) do nothing;

insert into public.event_settings (singleton, registration_mode)
values (true, 'studentNumber')
on conflict (singleton) do nothing;

alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.event_settings enable row level security;

revoke all on table public.groups, public.students, public.event_settings from anon, authenticated;
grant all on table public.groups, public.students, public.event_settings to service_role;
