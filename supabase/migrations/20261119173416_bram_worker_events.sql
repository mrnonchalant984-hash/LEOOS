create table if not exists public.bram_worker_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null,
  worker_id text not null check (char_length(worker_id) between 1 and 120),
  worker_type text not null check (worker_type in ('cloudflare_preview','build','agent')),
  event_type text not null check (event_type in ('claimed','started','progress','completed','failed','lease_lost')),
  status text not null check (status in ('queued','running','succeeded','failed','cancelled')),
  message text not null default '' check (char_length(message) <= 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists bram_worker_events_owner_project_idx on public.bram_worker_events(user_id, project_id, id desc);
create index if not exists bram_worker_events_job_idx on public.bram_worker_events(job_id, id);
alter table public.bram_worker_events enable row level security;
drop policy if exists "Users read own Bram worker events" on public.bram_worker_events;
create policy "Users read own Bram worker events" on public.bram_worker_events for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_worker_events to authenticated;
grant select, insert on public.bram_worker_events to service_role;
