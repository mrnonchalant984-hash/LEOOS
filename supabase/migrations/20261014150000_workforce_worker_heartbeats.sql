create table if not exists public.workforce_worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  worker_id text not null,
  status text not null check (status in ('running','idle','succeeded','failed','lease_lost')),
  job_id uuid,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workforce_worker_heartbeats_created_idx on public.workforce_worker_heartbeats(created_at desc);
alter table public.workforce_worker_heartbeats enable row level security;
-- Only service-role server code may write/read operational heartbeat records.
drop policy if exists workforce_worker_heartbeats_no_client_access on public.workforce_worker_heartbeats;
create policy workforce_worker_heartbeats_no_client_access on public.workforce_worker_heartbeats for all to authenticated using (false) with check (false);
