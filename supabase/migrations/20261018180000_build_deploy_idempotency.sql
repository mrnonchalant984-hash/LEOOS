-- Keep retries for one tenant-scoped deployment attached to one durable build row.
alter table public.project_builds add column if not exists idempotency_key text;
alter table public.project_builds add column if not exists request_hash text;

create unique index if not exists idx_project_builds_idempotency
  on public.project_builds(owner_user_id, website_project_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.start_customer_project_build_idempotent(
  p_project_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_monthly_limit integer,
  p_idempotency_key text,
  p_request_hash text,
  p_request_limit integer,
  p_window_seconds integer
) returns table(
  build_id uuid,
  disposition text,
  retry_after_seconds integer,
  build_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  project_type_value text;
  existing_id uuid;
  existing_hash text;
  existing_status text;
  build_count integer;
  request_allowed boolean;
  retry_seconds integer;
  new_id uuid;
begin
  if p_project_id is null or p_owner_user_id is null
     or p_monthly_limit is null or p_monthly_limit < 1
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 120
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_request_limit is null or p_request_limit < 1 or p_request_limit > 100
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid deployment request parameters.';
  end if;

  -- Serialize per-account admission and project-level idempotency across instances.
  perform 1 from public.profiles where id = p_owner_user_id for update;
  if not found then raise exception 'Project owner profile was not found.'; end if;
  select project_type into project_type_value
    from public.website_projects
    where id = p_project_id and owner_user_id = p_owner_user_id
    for update;
  if not found then raise exception 'Project not found.'; end if;

  select b.id, b.request_hash, b.status
    into existing_id, existing_hash, existing_status
    from public.project_builds b
    where b.owner_user_id = p_owner_user_id
      and b.website_project_id = p_project_id
      and b.idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_hash is distinct from p_request_hash then
      raise exception 'Idempotency key is already associated with a different deployment request.';
    end if;
    return query select existing_id, 'duplicate'::text, 0, existing_status;
    return;
  end if;

  select b.id, b.request_hash, b.status
    into existing_id, existing_hash, existing_status
    from public.project_builds b
    where b.owner_user_id = p_owner_user_id
      and b.website_project_id = p_project_id
      and b.status in ('building', 'testing', 'deploying')
    order by b.created_at desc
    limit 1;
  if existing_id is not null then
    if existing_hash = p_request_hash then
      return query select existing_id, 'duplicate'::text, 0, existing_status;
    else
      return query select existing_id, 'in_progress'::text, 0, existing_status;
    end if;
    return;
  end if;

  select public.consume_user_rate_limit(
    p_owner_user_id,
    'project-build-deploy',
    p_request_limit,
    p_window_seconds
  ) into request_allowed;
  if not request_allowed then
    select greatest(1, ceil(extract(epoch from (
      window_started_at + make_interval(secs => p_window_seconds) - clock_timestamp()
    )))::integer)
      into retry_seconds
      from public.user_rate_limits
      where user_id = p_owner_user_id and bucket = 'project-build-deploy';
    return query select null::uuid, 'rate_limited'::text, coalesce(retry_seconds, p_window_seconds), null::text;
    return;
  end if;

  select count(*) into build_count
    from public.project_builds
    where owner_user_id = p_owner_user_id
      and created_at >= date_trunc('month', now())
      and status in ('building', 'testing', 'deploying', 'live');
  if build_count >= p_monthly_limit then raise exception 'Monthly build limit reached.'; end if;

  insert into public.project_builds(
    website_project_id, owner_user_id, project_type, provider, status, step,
    idempotency_key, request_hash
  ) values (
    p_project_id, p_owner_user_id, project_type_value, p_provider, 'building', 'Generating source',
    p_idempotency_key, p_request_hash
  ) returning id into new_id;

  update public.website_projects
    set build_provider = p_provider,
        build_status = 'building',
        build_step = 'Generating source',
        last_build_at = now(),
        updated_at = now()
    where id = p_project_id and owner_user_id = p_owner_user_id;

  return query select new_id, 'started'::text, 0, 'building'::text;
end;
$$;

revoke all on function public.start_customer_project_build_idempotent(uuid,uuid,text,integer,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.start_customer_project_build_idempotent(uuid,uuid,text,integer,text,text,integer,integer)
  to service_role;
