-- LEO OS API keys control-plane migration.
-- Safe to re-run. Applied remotely under migration version 20261008.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes jsonb not null default '["read"]'::jsonb,
  revoked boolean not null default false,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_user
  on public.api_keys(user_id, created_at desc);

alter table public.api_keys enable row level security;

drop policy if exists api_keys_self on public.api_keys;
create policy api_keys_self
  on public.api_keys
  for all
  using (auth.uid() = user_id or public.is_owner(auth.uid()))
  with check (auth.uid() = user_id or public.is_owner(auth.uid()));

alter table public.api_keys add column if not exists description text;
alter table public.api_keys add column if not exists environment text not null default 'production';
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
