-- Secure same-account device pairing and server-mediated remote workspace events.
create table if not exists public.leo_remote_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pairing_code_hash text not null unique,
  created_device_name text not null default 'Unknown device',
  paired_device_name text,
  status text not null default 'pending' check (status in ('pending','paired','revoked','expired')),
  expires_at timestamptz not null,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists leo_remote_pairings_user_created_idx on public.leo_remote_pairings(user_id, created_at desc);
create index if not exists leo_remote_pairings_expiry_idx on public.leo_remote_pairings(expires_at) where status = 'pending';

create table if not exists public.leo_remote_events (
  id bigint generated always as identity primary key,
  pairing_id uuid not null references public.leo_remote_pairings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 80),
  event_type text not null check (event_type in ('message','chat.open','chat.sync','ping')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists leo_remote_events_pairing_id_idx on public.leo_remote_events(pairing_id, id);
create index if not exists leo_remote_events_created_idx on public.leo_remote_events(created_at);

alter table public.leo_remote_pairings enable row level security;
alter table public.leo_remote_events enable row level security;
-- All access goes through authenticated Next.js handlers using the service role;
-- no direct anon/authenticated table policies are intentionally granted.
revoke all on public.leo_remote_pairings from anon, authenticated;
revoke all on public.leo_remote_events from anon, authenticated;
grant all on public.leo_remote_pairings to service_role;
grant all on public.leo_remote_events to service_role;
grant usage, select on sequence public.leo_remote_events_id_seq to service_role;
