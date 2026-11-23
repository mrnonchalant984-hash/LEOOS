-- Reliable retries and worker liveness for Cloudflare preview jobs.
alter table public.cloudflare_preview_jobs
  drop constraint if exists cloudflare_preview_jobs_attempts_check;
alter table public.cloudflare_preview_jobs
  add constraint cloudflare_preview_jobs_attempts_check check (attempts between 0 and 3);

alter table public.cloudflare_preview_jobs
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.cloudflare_preview_jobs
  drop constraint if exists cloudflare_preview_jobs_error_code_check;
alter table public.cloudflare_preview_jobs
  add constraint cloudflare_preview_jobs_error_code_check
  check (
    error_code is null
    or error_code = any (array[
      'preview_build_failed',
      'preview_deploy_failed',
      'preview_not_ready',
      'preview_worker_timeout',
      'preview_worker_configuration_failed',
      'preview_worker_lease_expired'
    ]::text[])
  );

create index if not exists cloudflare_preview_jobs_retry_idx
  on public.cloudflare_preview_jobs(status, next_attempt_at, created_at)
  where status = 'queued';

create table if not exists public.cloudflare_preview_worker_heartbeats (
  worker_id text primary key check (char_length(worker_id) between 8 and 120),
  status text not null check (status in ('idle','running','failed')),
  job_id uuid references public.cloudflare_preview_jobs(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  error_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists cloudflare_preview_worker_heartbeats_seen_idx
  on public.cloudflare_preview_worker_heartbeats(last_seen_at desc);
alter table public.cloudflare_preview_worker_heartbeats enable row level security;
revoke all on public.cloudflare_preview_worker_heartbeats from anon, authenticated;
grant all on public.cloudflare_preview_worker_heartbeats to service_role;

create or replace function public.claim_cloudflare_preview_jobs(
  p_worker text,
  p_limit integer default 1,
  p_lease_seconds integer default 1800
) returns setof public.cloudflare_preview_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or p_limit < 1 or p_limit > 1
      or p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'Invalid Cloudflare preview worker claim parameters.';
  end if;

  -- Expired leases are recoverable until the bounded three-attempt limit.
  update public.cloudflare_preview_jobs
  set status = case when attempts < 3 then 'queued' else 'failed' end,
      error_code = 'preview_worker_lease_expired',
      static_files = case when attempts < 3 then static_files else '{}'::jsonb end,
      lease_owner = null,
      lease_expires_at = null,
      next_attempt_at = case when attempts < 3
        then now() + make_interval(secs => greatest(30, attempts * 60))
        else next_attempt_at end,
      completed_at = case when attempts < 3 then null else now() end
  where status = 'running'
    and lease_expires_at is not null
    and lease_expires_at <= now();

  return query
  with candidates as (
    select id from public.cloudflare_preview_jobs
    where status = 'queued'
      and attempts < 3
      and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.cloudflare_preview_jobs j
  set status = 'running',
      lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempts = j.attempts + 1,
      started_at = now(),
      completed_at = null
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.claim_cloudflare_preview_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_preview_jobs(text,integer,integer) to service_role;
