-- Owner-scoped metadata for locally-built debug APKs. Binary data remains in
-- the existing private leo-files bucket; clients never receive its storage path.
do $$
begin
  update storage.buckets
     set public = false,
         file_size_limit = greatest(coalesce(file_size_limit, 0), 157286400)
   where id = 'leo-files';
  if not found then
    raise exception 'Required leo-files Storage bucket is missing; create it before applying the Android artifact migration.';
  end if;
end;
$$;

create table if not exists public.android_build_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  idempotency_key uuid not null,
  status text not null default 'queued' check (status in ('queued','building','completed','failed')),
  storage_path text,
  size_bytes bigint,
  sha256 text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_user_id, idempotency_key),
  check (size_bytes is null or size_bytes > 0),
  check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  check (status <> 'completed' or (storage_path is not null and size_bytes is not null and sha256 is not null))
);
create index if not exists android_build_jobs_owner_created_idx
  on public.android_build_jobs(owner_user_id, created_at desc);
alter table public.android_build_jobs enable row level security;
drop policy if exists android_build_jobs_owner_select on public.android_build_jobs;
create policy android_build_jobs_owner_select on public.android_build_jobs
  for select using (auth.uid() = owner_user_id);
revoke all on public.android_build_jobs from anon, authenticated;
grant select on public.android_build_jobs to authenticated;
grant all on public.android_build_jobs to service_role;

create or replace function public.start_android_build_job(
  p_owner_user_id uuid,
  p_idempotency_key uuid,
  p_project_limit integer,
  p_monthly_limit integer
) returns table(job_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  new_id uuid;
  month_start timestamptz := date_trunc('month', now());
  project_count integer;
  build_count integer;
begin
  if p_project_limit < 1 or p_monthly_limit < 1 then raise exception 'Invalid build allowance.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text || ':android:' || to_char(month_start, 'YYYY-MM'), 0));
  select j.id into existing_id from android_build_jobs j
    where j.owner_user_id = p_owner_user_id and j.idempotency_key = p_idempotency_key;
  if existing_id is not null then return query select existing_id, false; return; end if;
  select count(*) into project_count from projects p where p.user_id = p_owner_user_id;
  if project_count >= p_project_limit then raise exception 'Project limit reached.'; end if;
  select
    (select count(*) from cloud_build_jobs c where c.owner_user_id = p_owner_user_id and c.created_at >= month_start and c.status not in ('failed','cancelled')) +
    (select count(*) from android_build_jobs a where a.owner_user_id = p_owner_user_id and a.created_at >= month_start and a.status <> 'failed')
    into build_count;
  if build_count >= p_monthly_limit then raise exception 'Monthly build limit reached.'; end if;
  insert into android_build_jobs(owner_user_id, idempotency_key, status)
    values (p_owner_user_id, p_idempotency_key, 'queued') returning id into new_id;
  return query select new_id, true;
end;
$$;
revoke all on function public.start_android_build_job(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.start_android_build_job(uuid,uuid,integer,integer) to service_role;
