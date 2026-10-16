create or replace function public.start_customer_project_build(
  p_project_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_monthly_limit integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  project_type_value text;
  build_count integer;
  build_id uuid;
begin
  perform 1 from profiles where id = p_owner_user_id for update;
  select project_type into project_type_value from website_projects
    where id = p_project_id and owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'Project not found'; end if;
  select count(*) into build_count from project_builds
    where owner_user_id = p_owner_user_id
      and created_at >= date_trunc('month', now())
      and status in ('building','testing','deploying','live');
  if build_count >= p_monthly_limit then raise exception 'Monthly build limit reached'; end if;
  insert into project_builds(website_project_id,owner_user_id,project_type,provider,status,step)
    values(p_project_id,p_owner_user_id,project_type_value,p_provider,'building','Generating source')
    returning id into build_id;
  update website_projects set build_provider=p_provider,build_status='building',build_step='Generating source',last_build_at=now(),updated_at=now()
    where id=p_project_id and owner_user_id=p_owner_user_id;
  return build_id;
end;
$$;
revoke all on function public.start_customer_project_build(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.start_customer_project_build(uuid,uuid,text,integer) to service_role;
