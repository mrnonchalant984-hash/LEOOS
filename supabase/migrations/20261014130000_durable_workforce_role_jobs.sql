-- Durable owner-only role execution with dependency gating and lease-based recovery.
create table if not exists public.workforce_role_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null check (char_length(role_id) between 1 and 100),
  role_name text not null check (char_length(role_name) between 1 and 160),
  project_id uuid references public.projects(id) on delete set null,
  task text not null check (char_length(task) between 1 and 12000),
  context text not null default '' check (char_length(context) <= 12000),
  dependencies uuid[] not null default '{}',
  idempotency_key text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','blocked','cancelled')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 3),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  result text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  check (cardinality(dependencies) <= 10),
  check (not (id = any(dependencies)))
);
create index if not exists workforce_role_jobs_queue_idx
  on public.workforce_role_jobs(status, available_at, created_at)
  where status in ('queued','running');
create index if not exists workforce_role_jobs_user_created_idx
  on public.workforce_role_jobs(user_id, created_at desc);
alter table public.workforce_role_jobs enable row level security;
drop policy if exists workforce_role_jobs_owner_read on public.workforce_role_jobs;
create policy workforce_role_jobs_owner_read on public.workforce_role_jobs for select using (auth.uid() = user_id);
revoke all on table public.workforce_role_jobs from public, anon, authenticated;
grant select on table public.workforce_role_jobs to authenticated;
grant all on table public.workforce_role_jobs to service_role;

create or replace function public.claim_workforce_role_jobs(
  p_worker text,
  p_limit integer default 1,
  p_lease_seconds integer default 90
)
returns setof public.workforce_role_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or length(p_worker) > 120 then raise exception 'invalid worker id'; end if;
  if p_limit < 1 or p_limit > 5 or p_lease_seconds < 30 or p_lease_seconds > 180 then raise exception 'invalid claim limits'; end if;

  update public.workforce_role_jobs j
     set status = 'blocked', error_code = 'dependency_failed', completed_at = now(), updated_at = now()
   where j.status = 'queued'
     and exists (
       select 1 from unnest(j.dependencies) as dep(dependency_id)
       join public.workforce_role_jobs d on d.id = dep.dependency_id and d.user_id = j.user_id
       where d.status in ('failed','blocked','cancelled')
     );

  update public.workforce_role_jobs j
     set status = 'failed', lease_owner = null, lease_expires_at = null,
         error_code = 'worker_lease_exhausted', completed_at = now(), updated_at = now()
   where j.status = 'running' and j.lease_expires_at < now() and j.attempts >= 3;

  return query
  with candidates as (
    select j.id from public.workforce_role_jobs j
     where ((j.status = 'queued' and j.available_at <= now())
         or (j.status = 'running' and j.lease_expires_at < now() and j.attempts < 3))
       and not exists (
         select 1 from unnest(j.dependencies) as dep(dependency_id)
         left join public.workforce_role_jobs d on d.id = dep.dependency_id and d.user_id = j.user_id
         where d.id is null or d.status <> 'succeeded'
       )
     order by j.available_at, j.created_at
     limit p_limit for update skip locked
  )
  update public.workforce_role_jobs j
     set status = 'running', attempts = j.attempts + 1, lease_owner = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         started_at = coalesce(j.started_at, now()), updated_at = now()
    from candidates c where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.claim_workforce_role_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_workforce_role_jobs(text, integer, integer) to service_role;
