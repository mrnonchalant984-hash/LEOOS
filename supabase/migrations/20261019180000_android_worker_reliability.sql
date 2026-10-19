-- Forward-only Android worker reliability: explicit start time and lease-owned atomic finalization.
alter table public.android_build_jobs
  add column if not exists started_at timestamptz;

-- Reinstall the claim function forward-only: recover null/expired leases and record the first start time.
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
     set status = 'failed', error = 'Build request expired before its project could be attached.',
         lease_owner = null, lease_expires_at = null, updated_at = now()
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

-- A worker that has already lost its lease must not extend it after another worker is eligible to claim it.
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
   where id = p_job_id and status = 'building' and lease_owner = p_worker
     and lease_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.heartbeat_android_build_job(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.heartbeat_android_build_job(uuid,text,integer) to service_role;

create or replace function public.finalize_android_build_job(
  p_job_id uuid,
  p_worker text,
  p_status text,
  p_storage_path text default null,
  p_size_bytes bigint default null,
  p_sha256 text default null,
  p_error text default null,
  p_retry_at timestamptz default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  current_job public.android_build_jobs%rowtype;
  final_status text := p_status;
  now_at timestamptz := now();
begin
  if p_status not in ('completed','queued','failed') then raise exception 'invalid Android job final status'; end if;
  select * into current_job from public.android_build_jobs
   where id = p_job_id and status = 'building' and lease_owner = p_worker
     and lease_expires_at > now_at
   for update;
  if not found then return false; end if;

  if p_status = 'completed' then
    if p_storage_path is null or p_size_bytes is null or p_size_bytes < 1
       or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
       or p_storage_path <> format('android-artifacts/%s/%s-%s.apk', current_job.owner_user_id, current_job.id, p_sha256) then
      raise exception 'invalid verified Android artifact metadata';
    end if;
    update public.android_build_jobs set
      status = 'completed', progress = 100, storage_path = p_storage_path,
      size_bytes = p_size_bytes, sha256 = p_sha256, error = null,
      lease_owner = null, lease_expires_at = null,
      updated_at = now_at, completed_at = now_at
    where id = p_job_id;
    return true;
  end if;

  if p_status = 'queued' and current_job.attempts < 3 and p_retry_at is not null and p_retry_at > now_at then
    final_status := 'queued';
    update public.android_build_jobs set
      status = final_status, progress = 0, storage_path = null, size_bytes = null, sha256 = null,
      error = left(coalesce(p_error, 'Android build failed; retry scheduled.'), 500),
      available_at = p_retry_at, lease_owner = null, lease_expires_at = null,
      updated_at = now_at, completed_at = null
    where id = p_job_id;
    return true;
  end if;

  update public.android_build_jobs set
    status = 'failed', progress = 0, storage_path = null, size_bytes = null, sha256 = null,
    error = left(coalesce(p_error, 'Android build failed after the allowed attempts.'), 500),
    lease_owner = null, lease_expires_at = null, updated_at = now_at, completed_at = null
  where id = p_job_id;
  return true;
end;
$$;
revoke all on function public.finalize_android_build_job(uuid,text,text,text,bigint,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_android_build_job(uuid,text,text,text,bigint,text,text,timestamptz) to service_role;
