create table if not exists public.cloudflare_preview_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_name text not null,
  static_files jsonb not null check (jsonb_typeof(static_files) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','deployed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 1),
  lease_owner text,
  lease_expires_at timestamptz,
  deployment_url text,
  error_code text check (error_code is null or error_code in ('preview_deploy_failed','preview_not_ready','preview_worker_timeout')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists cloudflare_preview_jobs_queue_idx
  on public.cloudflare_preview_jobs(status, created_at)
  where status in ('queued','running');
create index if not exists cloudflare_preview_jobs_owner_created_idx
  on public.cloudflare_preview_jobs(user_id, project_id, created_at desc);
create unique index if not exists cloudflare_preview_jobs_one_active_per_project
  on public.cloudflare_preview_jobs(project_id)
  where status in ('queued','running');

alter table public.cloudflare_preview_jobs enable row level security;
drop policy if exists cloudflare_preview_jobs_owner_read on public.cloudflare_preview_jobs;
create policy cloudflare_preview_jobs_owner_read on public.cloudflare_preview_jobs
  for select using (auth.uid() = user_id or public.is_owner(auth.uid()));
revoke all on public.cloudflare_preview_jobs from anon, authenticated;
grant select on public.cloudflare_preview_jobs to authenticated;
grant all on public.cloudflare_preview_jobs to service_role;

create or replace function public.create_cloudflare_preview_job(
  p_user_id uuid,
  p_project_id uuid,
  p_static_files jsonb,
  p_monthly_limit integer
) returns public.cloudflare_preview_jobs
language plpgsql security definer set search_path = public as $$
declare
  project_row public.projects%rowtype;
  user_preview_count integer;
  user_build_count integer;
  account_preview_count integer;
  created_job public.cloudflare_preview_jobs%rowtype;
begin
  if p_user_id is null or p_project_id is null or p_static_files is null
      or p_monthly_limit is null or p_monthly_limit < 1
      or jsonb_typeof(p_static_files) <> 'object'
      or octet_length(p_static_files::text) > 4000000 then
    raise exception 'preview_invalid_request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('cloudflare-preview-usage'));
  select * into project_row from public.projects
    where id = p_project_id and user_id = p_user_id for update;
  if not found then
    raise exception 'preview_project_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.cloudflare_preview_jobs
    where project_id = p_project_id and status in ('queued','running')
  ) then
    raise exception 'preview_job_active' using errcode = 'P0001';
  end if;

  select count(*) into user_preview_count from public.cloudflare_preview_jobs
    where user_id = p_user_id and created_at >= now() - interval '24 hours';
  if user_preview_count >= 3 then
    raise exception 'preview_user_daily_limit' using errcode = 'P0001';
  end if;

  select count(*) into user_build_count from (
    select id from public.project_builds
      where owner_user_id = p_user_id
        and created_at >= date_trunc('month', now())
        and status in ('building','testing','deploying','live')
    union all
    select id from public.cloudflare_preview_jobs
      where user_id = p_user_id and created_at >= date_trunc('month', now())
  ) monthly_builds;
  if user_build_count >= p_monthly_limit then
    raise exception 'preview_user_monthly_limit' using errcode = 'P0001';
  end if;

  select count(*) into account_preview_count from public.cloudflare_preview_jobs
    where created_at >= now() - interval '30 days';
  if account_preview_count >= 400 then
    raise exception 'preview_account_monthly_limit' using errcode = 'P0001';
  end if;

  delete from public.cloudflare_preview_jobs
    where status in ('deployed','failed') and created_at < now() - interval '30 days';

  insert into public.cloudflare_preview_jobs(project_id, user_id, branch_name, static_files)
    values (
      p_project_id,
      p_user_id,
      'leo-preview-' || replace(p_project_id::text, '-', ''),
      p_static_files
    )
    returning * into created_job;
  return created_job;
end;
$$;
revoke all on function public.create_cloudflare_preview_job(uuid,uuid,jsonb,integer) from public, anon, authenticated;
grant execute on function public.create_cloudflare_preview_job(uuid,uuid,jsonb,integer) to service_role;

create or replace function public.claim_cloudflare_preview_jobs(
  p_worker text,
  p_limit integer default 1,
  p_lease_seconds integer default 480
) returns setof public.cloudflare_preview_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or p_limit < 1 or p_limit > 1
      or p_lease_seconds < 60 or p_lease_seconds > 600 then
    raise exception 'Invalid Cloudflare preview worker claim parameters.';
  end if;

  update public.cloudflare_preview_jobs set status = 'failed',
    error_code = 'preview_worker_timeout', static_files = '{}'::jsonb,
    lease_owner = null, lease_expires_at = null, completed_at = now()
  where status = 'running' and lease_expires_at < now();

  return query
  with candidates as (
    select id from public.cloudflare_preview_jobs
    where status = 'queued' and attempts = 0
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.cloudflare_preview_jobs j set status = 'running',
    lease_owner = p_worker,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = j.attempts + 1,
    started_at = coalesce(j.started_at, now())
  from candidates c where j.id = c.id returning j.*;
end;
$$;
revoke all on function public.claim_cloudflare_preview_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_preview_jobs(text,integer,integer) to service_role;
