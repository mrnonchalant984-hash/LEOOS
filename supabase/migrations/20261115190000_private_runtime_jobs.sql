create table if not exists public.private_runtime_jobs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  kind text not null check (kind in ('workspace','leocode','skill','repository')),
  operation text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists private_runtime_jobs_owner_created_idx on public.private_runtime_jobs(owner_id, created_at desc);
create index if not exists private_runtime_jobs_status_idx on public.private_runtime_jobs(status, created_at);
alter table public.private_runtime_jobs enable row level security;
create policy "Users can read their own private runtime jobs" on public.private_runtime_jobs for select using (auth.uid() = owner_id);
revoke all on public.private_runtime_jobs from anon, authenticated;
grant select on public.private_runtime_jobs to authenticated;
