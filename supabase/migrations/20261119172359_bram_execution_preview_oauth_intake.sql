-- Bram durable execution events, customer-owned shared previews, collaboration comments,
-- resumable OAuth handoffs, and conversational website intake.
-- All user-facing rows are owner-scoped; privileged worker writes use service_role.

create table if not exists public.bram_execution_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chats_v2(id) on delete cascade,
  request_id uuid not null,
  execution_id uuid,
  worker_id text,
  phase text not null check (char_length(phase) between 1 and 100),
  event_type text not null check (event_type in ('queued','started','progress','completed','failed','cancelled','resumed')),
  status text not null check (status in ('queued','running','succeeded','failed','cancelled')),
  message text not null default '' check (char_length(message) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists bram_execution_events_session_idx
  on public.bram_execution_events(user_id, session_id, id desc);
create index if not exists bram_execution_events_request_idx
  on public.bram_execution_events(user_id, request_id, id);
alter table public.bram_execution_events enable row level security;
drop policy if exists "Users read own Bram execution events" on public.bram_execution_events;
create policy "Users read own Bram execution events" on public.bram_execution_events
  for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_execution_events to authenticated;
grant select, insert on public.bram_execution_events to service_role;

create table if not exists public.bram_preview_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_token_hash text not null unique check (char_length(share_token_hash) = 64),
  preview_url text not null check (char_length(preview_url) between 8 and 2048),
  title text not null default 'Shared preview' check (char_length(title) between 1 and 180),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  allow_comments boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz
);
create index if not exists bram_preview_shares_owner_project_idx
  on public.bram_preview_shares(user_id, project_id, created_at desc);
create index if not exists bram_preview_shares_active_idx
  on public.bram_preview_shares(share_token_hash) where status = 'active';
alter table public.bram_preview_shares enable row level security;
drop policy if exists "Users manage own Bram preview shares" on public.bram_preview_shares;
create policy "Users manage own Bram preview shares" on public.bram_preview_shares
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.bram_preview_shares to authenticated;
grant select, insert, update, delete on public.bram_preview_shares to service_role;

create table if not exists public.bram_preview_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.bram_preview_shares(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  anchor jsonb not null default '{}'::jsonb check (jsonb_typeof(anchor) = 'object'),
  status text not null default 'open' check (status in ('open','queued','applied','dismissed','failed')),
  edit_request_id uuid,
  applied_revision bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bram_preview_comments_share_idx
  on public.bram_preview_comments(share_id, created_at);
create index if not exists bram_preview_comments_owner_idx
  on public.bram_preview_comments(user_id, project_id, status, created_at desc);
alter table public.bram_preview_comments enable row level security;
drop policy if exists "Users manage own Bram preview comments" on public.bram_preview_comments;
create policy "Users manage own Bram preview comments" on public.bram_preview_comments
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.bram_preview_comments to authenticated;
grant select, insert, update, delete on public.bram_preview_comments to service_role;

create table if not exists public.bram_oauth_resumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 80),
  state_hash text not null unique check (char_length(state_hash) = 64),
  session_id uuid references public.chats_v2(id) on delete set null,
  request_id uuid,
  continuation jsonb not null default '{}'::jsonb check (jsonb_typeof(continuation) = 'object'),
  status text not null default 'pending' check (status in ('pending','verified','resumed','failed','expired')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  resumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bram_oauth_resumptions_user_status_idx
  on public.bram_oauth_resumptions(user_id, status, expires_at);
alter table public.bram_oauth_resumptions enable row level security;
drop policy if exists "Users read own Bram OAuth resumptions" on public.bram_oauth_resumptions;
create policy "Users read own Bram OAuth resumptions" on public.bram_oauth_resumptions
  for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_oauth_resumptions to authenticated;
grant select, insert, update on public.bram_oauth_resumptions to service_role;

create table if not exists public.bram_website_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chats_v2(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  website_project_id uuid references public.website_projects(id) on delete set null,
  request_id uuid,
  status text not null default 'collecting' check (status in ('collecting','ready','creating','created','failed','cancelled')),
  requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(requirements) = 'object'),
  missing_requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_requirements) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bram_website_intakes_user_updated_idx
  on public.bram_website_intakes(user_id, updated_at desc);
alter table public.bram_website_intakes enable row level security;
drop policy if exists "Users manage own Bram website intakes" on public.bram_website_intakes;
create policy "Users manage own Bram website intakes" on public.bram_website_intakes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.bram_website_intakes to authenticated;
grant select, insert, update, delete on public.bram_website_intakes to service_role;
