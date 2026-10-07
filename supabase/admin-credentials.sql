-- QR-GAAP stores one shared admin password as a salted scrypt hash.

create table if not exists public.admin_credentials (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_credentials enable row level security;
revoke all on table public.admin_credentials from anon, authenticated;
grant select, insert, update on table public.admin_credentials to service_role;

notify pgrst, 'reload schema';
