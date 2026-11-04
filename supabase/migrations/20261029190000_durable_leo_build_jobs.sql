-- Durable Leo chat build queue. Payloads contain generated source only; credentials are never stored here.
create table if not exists public.leo_build_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  website_project_id uuid not null references public.website_projects(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  project_build_id uuid references public.project_builds(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(user_id, website_project_id, idempotency_key)
);
create index if not exists leo_build_jobs_queue_idx on public.leo_build_jobs(status, available_at, created_at)
  where status in ('queued','running');
alter table public.leo_build_jobs enable row level security;
drop policy if exists leo_build_jobs_owner_read on public.leo_build_jobs;
create policy leo_build_jobs_owner_read on public.leo_build_jobs for select using (auth.uid() = user_id or public.is_owner(auth.uid()));
revoke all on public.leo_build_jobs from anon, authenticated;
grant select on public.leo_build_jobs to authenticated;

create or replace function public.claim_leo_build_jobs(p_worker text, p_limit integer default 1, p_lease_seconds integer default 360)
returns setof public.leo_build_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or p_limit < 1 or p_limit > 3 or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'Invalid build worker claim parameters.';
  end if;
  return query
  with candidates as (
    select id from public.leo_build_jobs
    where (status = 'queued' and available_at <= now())
       or (status = 'running' and lease_expires_at < now() and attempts < 3)
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.leo_build_jobs j set status='running', lease_owner=p_worker,
    lease_expires_at=now() + make_interval(secs => p_lease_seconds),
    attempts=j.attempts+1, started_at=coalesce(j.started_at, now())
  from candidates c where j.id=c.id returning j.*;
end;
$$;
revoke all on function public.claim_leo_build_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_leo_build_jobs(text,integer,integer) to service_role;
