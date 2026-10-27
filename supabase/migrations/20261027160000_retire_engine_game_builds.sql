-- Retire engine-dependent game compilation while preserving historical job rows.
-- Browser games are saved as source files and run in the browser; only Expo remains
-- an active cloud-build provider. The existing provider check constraint is retained
-- so historical Godot records remain readable for audit.
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
  if p_provider <> 'expo-eas' then raise exception 'Native engine game builds are retired; browser games do not use cloud compilation.'; end if;
  select p.user_id, p.type into project_owner, project_type from public.projects p where p.id = p_project_id;
  if project_owner is distinct from p_owner_user_id then raise exception 'Project not found.'; end if;
  if project_type <> 'mobile_app' then raise exception 'Project type does not match build provider.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text || ':' || to_char(month_start, 'YYYY-MM'), 0));
  select j.id into existing_id from public.cloud_build_jobs j
    where j.owner_user_id=p_owner_user_id and j.project_id=p_project_id and j.idempotency_key=p_idempotency_key;
  if existing_id is not null then return query select existing_id, false; return; end if;
  select count(*) into used_count from public.cloud_build_jobs j
    where j.owner_user_id=p_owner_user_id and j.created_at >= month_start and j.status not in ('failed','cancelled');
  if used_count >= p_monthly_limit then raise exception 'Monthly build limit reached.'; end if;
  insert into public.cloud_build_jobs(owner_user_id,project_id,provider,profile,idempotency_key)
    values(p_owner_user_id,p_project_id,p_provider,p_profile,p_idempotency_key) returning id into new_id;
  return query select new_id, true;
end;
$$;
revoke all on function public.start_cloud_build_job(uuid,uuid,text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.start_cloud_build_job(uuid,uuid,text,text,uuid,integer) to service_role;
