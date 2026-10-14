create table if not exists public.offline_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  event_kind text not null check (event_kind in ('draft', 'workforce_task')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'accepted' check (status in ('accepted', 'queued', 'rejected')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists offline_sync_events_user_created_idx on public.offline_sync_events(user_id, created_at desc);
alter table public.offline_sync_events enable row level security;
drop policy if exists offline_sync_events_select_own on public.offline_sync_events;
create policy offline_sync_events_select_own on public.offline_sync_events for select to authenticated using (auth.uid() = user_id);
drop policy if exists offline_sync_events_no_client_insert on public.offline_sync_events;
create policy offline_sync_events_no_client_insert on public.offline_sync_events for insert to authenticated with check (false);
drop policy if exists offline_sync_events_no_client_update on public.offline_sync_events;
create policy offline_sync_events_no_client_update on public.offline_sync_events for update to authenticated using (false) with check (false);
