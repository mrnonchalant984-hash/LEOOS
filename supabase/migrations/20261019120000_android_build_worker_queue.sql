-- Forward-only hardening for the already-applied Android artifact migration.
-- Keep 20261019100000_android_build_artifacts.sql immutable after deployment.

do $$
begin
  update storage.buckets
     set public = false,
         file_size_limit = greatest(coalesce(file_size_limit, 0), 157286400)
   where id = 'leo-files';
  if not found then
    raise exception 'Required leo-files Storage bucket is missing; create it before applying the Android worker migration.';
  end if;
end;
$$;

alter table public.android_build_jobs
  add column if not exists progress integer not null default 0 check (progress between 0 and 100),
  add column if not exists attempts integer not null default 0 check (attempts between 0 and 3),
  add column if not exists started_at timestamptz,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz;

create index if not exists android_build_jobs_queue_idx
  on public.android_build_jobs(status, available_at, created_at)
  where status in ('queued','building');

-- One Gradle build at a time across all web instances. Crashed jobs become
-- claimable after their 15-minute lease expires; attempts are strictly bounded.
create or replace function public.claim_android_build_job(p_worker text)
returns setof public.android_build_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or length(p_worker) > 120 then
    raise exception 'invalid worker id';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('leonardx:android-build-worker', 0));

  update public.android_build_jobs
     set status = 'failed', progress = 0, lease_owner = null, lease_expires_at = null,
         error = 'Worker lease expired three times. Retry this build with a new idempotency key.',
         updated_at = now()
   where status = 'building' and (lease_expires_at is null or lease_expires_at < now()) and attempts >= 3;

  update public.android_build_jobs
     set status = 'failed', error = 'Build request expired before its project could be attached.', updated_at = now()
   where status = 'queued' and project_id is null and created_at < now() - interval '10 minutes';

  if exists (
    select 1 from public.android_build_jobs
     where status = 'building' and lease_expires_at >= now()
  ) then
    return;
  end if;

  return query
  with candidate as (
    select id from public.android_build_jobs
     where (status = 'queued' and project_id is not null and available_at <= now())
        or (status = 'building' and (lease_expires_at is null or lease_expires_at < now()) and attempts < 3)
     order by created_at
     limit 1
     for update skip locked
  )
  update public.android_build_jobs j
     set status = 'building', progress = 10, attempts = j.attempts + 1,
         started_at = coalesce(j.started_at, now()),
         lease_owner = p_worker, lease_expires_at = now() + interval '15 minutes',
         error = null, updated_at = now()
    from candidate c where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.claim_android_build_job(text) from public, anon, authenticated;
grant execute on function public.claim_android_build_job(text) to service_role;

create or replace function public.heartbeat_android_build_job(
  p_job_id uuid, p_worker text, p_progress integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if p_progress < 10 or p_progress > 99 then raise exception 'invalid build progress'; end if;
  update public.android_build_jobs
     set progress = greatest(progress, p_progress),
         lease_expires_at = now() + interval '15 minutes', updated_at = now()
   where id = p_job_id and status = 'building' and lease_owner = p_worker;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.heartbeat_android_build_job(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.heartbeat_android_build_job(uuid,text,integer) to service_role;
