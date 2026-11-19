-- Bram chat-native preview sharing, review comments, and durable execution timeline.
-- All rows are account-owned. Public preview access is granted only through a
-- high-entropy, hashed, expiring share token; source files are never returned.

create table if not exists public.bram_preview_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  preview_url text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bram_preview_shares_project_owner_idx
  on public.bram_preview_shares(project_id, owner_user_id, created_at desc);
create index if not exists bram_preview_shares_expiry_idx
  on public.bram_preview_shares(expires_at) where revoked_at is null;

create table if not exists public.bram_preview_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  anchor jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','addressed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bram_preview_comments_project_owner_idx
  on public.bram_preview_comments(project_id, owner_user_id, created_at asc);

create table if not exists public.bram_execution_events (
  id bigint generated always as identity primary key,
  execution_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  event_type text not null check (event_type in ('accepted','working','tool_started','tool_completed','waiting_for_connection','completed','failed','cancelled')),
  message text not null check (char_length(message) between 1 and 1000),
  tool_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bram_execution_events_owner_session_idx
  on public.bram_execution_events(owner_user_id, session_id, id desc);
create index if not exists bram_execution_events_execution_idx
  on public.bram_execution_events(execution_id, id asc);

alter table public.bram_preview_shares enable row level security;
alter table public.bram_preview_comments enable row level security;
alter table public.bram_execution_events enable row level security;

drop policy if exists bram_preview_shares_owner_select on public.bram_preview_shares;
create policy bram_preview_shares_owner_select on public.bram_preview_shares
  for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists bram_preview_comments_owner_all on public.bram_preview_comments;
create policy bram_preview_comments_owner_all on public.bram_preview_comments
  for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists bram_execution_events_owner_select on public.bram_execution_events;
create policy bram_execution_events_owner_select on public.bram_execution_events
  for select to authenticated using (owner_user_id = auth.uid());

revoke all on public.bram_preview_shares, public.bram_preview_comments, public.bram_execution_events from anon, authenticated;
grant select on public.bram_preview_shares to authenticated;
grant select, insert, update, delete on public.bram_preview_comments to authenticated;
grant select on public.bram_execution_events to authenticated;
grant usage, select on sequence public.bram_execution_events_id_seq to service_role;
