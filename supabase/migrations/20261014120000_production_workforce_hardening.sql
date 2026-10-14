-- Production hardening for durable agent workers.
-- This migration is additive and must be applied through the controlled release process.

alter table public.agent_jobs
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_agent_jobs_lease_recovery
  on public.agent_jobs(status, lease_expires_at)
  where status = 'running';

create or replace function public.claim_agent_jobs(
  p_worker text,
  p_limit integer default 1,
  p_lease_seconds integer default 90
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker is null or length(p_worker) < 8 or length(p_worker) > 120 then
    raise exception 'invalid worker id';
  end if;
  if p_limit < 1 or p_limit > 5 or p_lease_seconds < 30 or p_lease_seconds > 180 then
    raise exception 'invalid claim limits';
  end if;

  -- Jobs that exhausted their retry budget are finalized before claiming.
  with expired as (
    update public.agent_jobs j
       set status = 'failed', locked_at = null, locked_by = null,
           lease_expires_at = null,
           last_error = 'Worker lease expired after maximum attempts.',
           updated_at = now()
     where j.status = 'running'
       and j.lease_expires_at < now()
       and j.attempts >= 3
     returning j.run_id, j.user_id
  )
  update public.agent_runs r
     set status = 'failed',
         error = 'Worker lease expired after maximum attempts.',
         completed_at = now()
    from expired e
   where r.id = e.run_id and r.user_id = e.user_id;

  return query
  with candidates as (
    select j.id
      from public.agent_jobs j
     where ((j.status = 'queued' and j.available_at <= now())
         or (j.status = 'running' and j.lease_expires_at < now() and j.attempts < 3))
     order by j.available_at, j.created_at
     limit p_limit
     for update skip locked
  )
  update public.agent_jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_error = case when j.status = 'running' then 'Recovered after expired worker lease.' else j.last_error end,
         updated_at = now()
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_agent_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_agent_jobs(text, integer, integer) to service_role;

-- A queue item cannot be read or changed directly by client roles.
revoke all on table public.agent_jobs from public, anon, authenticated;
grant all on table public.agent_jobs to service_role;
