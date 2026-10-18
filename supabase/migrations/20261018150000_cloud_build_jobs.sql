-- Durable cloud build metadata for mobile and Godot integrations.
-- Build starts are counted against the existing monthly build allowance;
-- this migration does not introduce credit prices or alter plan contracts.

create table if not exists public.cloud_build_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('expo-eas','godot-build-service')),
  provider_job_id text,
  status text not null default 'queued' check (status in ('queued','building','completed','failed','cancelled')),
  profile text not null,
  error text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_user_id, project_id, idempotency_key)
);

create index if not exists cloud_build_jobs_owner_created_idx
  on public.cloud_build_jobs(owner_user_id, created_at desc);
create index if not exists cloud_build_jobs_project_created_idx
  on public.cloud_build_jobs(project_id, created_at desc);
alter table public.cloud_build_jobs enable row level security;
drop policy if exists cloud_build_jobs_owner_select on public.cloud_build_jobs;
create policy cloud_build_jobs_owner_select on public.cloud_build_jobs
  for select using (auth.uid() = owner_user_id);

create or replace function public.start_cloud_build_job(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_provider text,
  p_profile text,
  p_idempotency_key uuid,
  p_monthly_limit integer
) returns table(job_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  project_owner uuid;
  project_type text;
  new_id uuid;
  month_start timestamptz := date_trunc('month', now());
  used_count integer;
begin
  if p_monthly_limit < 1 or p_monthly_limit > 2147483647 then raise exception 'Invalid monthly build allowance.'; end if;
  if p_provider not in ('expo-eas','godot-build-service') then raise exception 'Invalid build provider.'; end if;
  select p.user_id, p.type into project_owner, project_type from projects p where p.id = p_project_id;
  if project_owner is distinct from p_owner_user_id then raise exception 'Project not found.'; end if;
  if (p_provider = 'expo-eas' and project_type <> 'mobile_app') or
     (p_provider = 'godot-build-service' and project_type <> 'game') then raise exception 'Project type does not match build provider.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text || ':' || to_char(month_start, 'YYYY-MM'), 0));
  select j.id into existing_id from cloud_build_jobs j
    where j.owner_user_id=p_owner_user_id and j.project_id=p_project_id and j.idempotency_key=p_idempotency_key;
  if existing_id is not null then return query select existing_id, false; return; end if;
  select count(*) into used_count from cloud_build_jobs j
    where j.owner_user_id=p_owner_user_id and j.created_at >= month_start and j.status not in ('failed','cancelled');
  if used_count >= p_monthly_limit then raise exception 'Monthly build limit reached.'; end if;
  insert into cloud_build_jobs(owner_user_id,project_id,provider,profile,idempotency_key)
    values(p_owner_user_id,p_project_id,p_provider,p_profile,p_idempotency_key) returning id into new_id;
  return query select new_id, true;
end;
$$;

revoke all on function public.start_cloud_build_job(uuid,uuid,text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.start_cloud_build_job(uuid,uuid,text,text,uuid,integer) to service_role;
