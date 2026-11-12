alter table public.agent_jobs
  add column if not exists checkpoint jsonb not null default '{"completed_nodes":{}}'::jsonb,
  add column if not exists pause_requested boolean not null default false,
  add column if not exists cancel_requested boolean not null default false;
alter table public.integration_oauth_states
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.agent_jobs drop constraint if exists agent_jobs_status_check;
alter table public.agent_jobs add constraint agent_jobs_status_check
  check (status in ('queued','running','paused','succeeded','failed','cancelled'));
create index if not exists idx_agent_jobs_paused
  on public.agent_jobs(user_id, updated_at desc) where status = 'paused';

create table if not exists public.agent_execution_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (length(event_type) between 2 and 64),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 32768),
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_execution_events_user_created
  on public.agent_execution_events(user_id, created_at desc);
create index if not exists idx_agent_execution_events_run_created
  on public.agent_execution_events(run_id, created_at desc);
alter table public.agent_execution_events enable row level security;
revoke all on public.agent_execution_events from public, anon, authenticated;
grant all on public.agent_execution_events to service_role;

create or replace function public.record_agent_job_transition()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.agent_execution_events(run_id, user_id, event_type, payload)
    values (new.run_id, new.user_id, 'job_status_changed',
      jsonb_build_object('from', old.status, 'to', new.status, 'attempts', new.attempts));
  end if;
  return new;
end;
$$;
revoke all on function public.record_agent_job_transition() from public, anon, authenticated;

drop trigger if exists agent_job_transition_event on public.agent_jobs;
create trigger agent_job_transition_event
  after update of status on public.agent_jobs
  for each row execute function public.record_agent_job_transition();

create or replace function public.record_agent_approval_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.run_id is not null and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into public.agent_execution_events(run_id, user_id, event_type, payload)
    values (new.run_id, new.user_id,
      case when tg_op = 'INSERT' then 'approval_requested' else 'approval_status_changed' end,
      jsonb_build_object(
        'approval_id', new.id,
        'action', new.action,
        'status', new.status,
        'previous_status', case when tg_op = 'UPDATE' then old.status else null end
      ));
  end if;
  return new;
end;
$$;
revoke all on function public.record_agent_approval_event() from public, anon, authenticated;

drop trigger if exists agent_approval_execution_event on public.agent_approvals;
create trigger agent_approval_execution_event
  after insert or update of status on public.agent_approvals
  for each row execute function public.record_agent_approval_event();

create or replace function public.claim_agent_jobs(
  p_worker text,
  p_limit integer default 1,
  p_lease_seconds integer default 90
) returns setof public.agent_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 8 or length(p_worker) > 120
    or p_limit < 1 or p_limit > 5 or p_lease_seconds < 30 or p_lease_seconds > 180 then
    raise exception 'invalid agent job claim parameters';
  end if;

  with controlled as (
    update public.agent_jobs
       set status = case when cancel_requested then 'cancelled' else 'paused' end,
           cancel_requested = false, pause_requested = false,
           locked_at = null, locked_by = null, lease_expires_at = null, updated_at = now()
     where status = 'running' and lease_expires_at < now()
       and (pause_requested or cancel_requested)
     returning run_id, user_id, status
  )
  update public.agent_runs r
     set status = c.status,
         completed_at = case when c.status = 'cancelled' then now() else r.completed_at end
    from controlled c
   where r.id = c.run_id and r.user_id = c.user_id;

  with expired as (
    update public.agent_jobs j
       set status = 'failed', locked_at = null, locked_by = null, lease_expires_at = null,
           last_error = 'Worker lease expired after maximum attempts.', updated_at = now()
     where j.status = 'running' and j.lease_expires_at < now()
       and j.attempts >= 3 and not j.pause_requested and not j.cancel_requested
     returning j.run_id, j.user_id
  )
  update public.agent_runs r
     set status = 'failed', error = 'Worker lease expired after maximum attempts.', completed_at = now()
    from expired e
   where r.id = e.run_id and r.user_id = e.user_id;

  return query
  with candidates as (
    select j.id
      from public.agent_jobs j
     where ((j.status = 'queued' and j.available_at <= now())
         or (j.status = 'running' and j.lease_expires_at < now() and j.attempts < 3))
       and not j.pause_requested and not j.cancel_requested
     order by j.available_at, j.created_at
     limit p_limit
     for update skip locked
  )
  update public.agent_jobs j
     set status = 'running', attempts = j.attempts + 1,
         locked_at = now(), locked_by = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_error = case when j.status = 'running' then 'Recovered after expired worker lease.' else j.last_error end,
         updated_at = now()
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.claim_agent_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_agent_jobs(text,integer,integer) to service_role;

create or replace function public.control_agent_job(
  p_run_id uuid,
  p_user_id uuid,
  p_action text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target public.agent_jobs%rowtype;
  next_status text;
begin
  if p_run_id is null or p_user_id is null or p_action not in ('pause','resume','cancel','retry') then
    raise exception 'invalid agent job control request';
  end if;
  select j.* into target
    from public.agent_jobs j
   where j.run_id = p_run_id and j.user_id = p_user_id
   for update;
  if not found then raise exception 'agent job not found'; end if;

  if p_action = 'pause' then
    if target.status = 'queued' then
      update public.agent_jobs set status = 'paused', updated_at = now() where id = target.id;
      update public.agent_runs set status = 'paused' where id = p_run_id and user_id = p_user_id;
      next_status := 'paused';
    elsif target.status = 'running' then
      update public.agent_jobs set pause_requested = true, updated_at = now() where id = target.id;
      update public.agent_runs set status = 'pausing' where id = p_run_id and user_id = p_user_id;
      next_status := 'pause_requested';
    elsif target.status = 'paused' then
      next_status := 'paused';
    else raise exception 'agent job cannot be paused from its current state'; end if;
  elsif p_action = 'resume' then
    if target.status <> 'paused' then raise exception 'agent job is not paused'; end if;
    update public.agent_jobs set status = 'queued', available_at = now(), pause_requested = false,
      cancel_requested = false, updated_at = now() where id = target.id;
    update public.agent_runs set status = 'queued', error = null, completed_at = null
      where id = p_run_id and user_id = p_user_id;
    next_status := 'queued';
  elsif p_action = 'cancel' then
    if target.status in ('queued','paused') then
      update public.agent_jobs set status = 'cancelled', pause_requested = false,
        cancel_requested = false, locked_at = null, locked_by = null, lease_expires_at = null,
        updated_at = now() where id = target.id;
      update public.agent_runs set status = 'cancelled', completed_at = now()
        where id = p_run_id and user_id = p_user_id;
      next_status := 'cancelled';
    elsif target.status = 'running' then
      update public.agent_jobs set cancel_requested = true, updated_at = now() where id = target.id;
      update public.agent_runs set status = 'cancelling' where id = p_run_id and user_id = p_user_id;
      next_status := 'cancel_requested';
    else raise exception 'agent job cannot be cancelled from its current state'; end if;
  else
    if target.status <> 'failed' then raise exception 'only failed agent jobs can be retried'; end if;
    update public.agent_jobs set status = 'queued', attempts = 0, available_at = now(),
      pause_requested = false, cancel_requested = false, last_error = null, updated_at = now()
      where id = target.id;
    update public.agent_runs set status = 'queued', error = null, completed_at = null
      where id = p_run_id and user_id = p_user_id;
    next_status := 'queued';
  end if;

  insert into public.agent_execution_events(run_id, user_id, event_type, payload)
  values (p_run_id, p_user_id, 'job_' || p_action, jsonb_build_object('status', next_status));
  return jsonb_build_object('status', next_status);
end;
$$;
revoke all on function public.control_agent_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.control_agent_job(uuid,uuid,text) to service_role;

create or replace function public.record_agent_execution_checkpoint(
  p_job_id uuid,
  p_worker text,
  p_node_id text,
  p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target public.agent_jobs%rowtype;
  next_checkpoint jsonb;
  next_status text := 'continue';
begin
  if p_job_id is null or p_worker is null or length(p_worker) < 8 or length(p_worker) > 120
    or p_node_id is null or p_node_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_result is null or jsonb_typeof(p_result) <> 'object' or pg_column_size(p_result) > 16384 then
    raise exception 'invalid agent execution checkpoint';
  end if;
  select * into target from public.agent_jobs
   where id = p_job_id and status = 'running' and locked_by = p_worker
     and lease_expires_at > now()
   for update;
  if not found then return jsonb_build_object('control','lease_lost'); end if;

  next_checkpoint := jsonb_set(
    coalesce(target.checkpoint, '{"completed_nodes":{}}'::jsonb),
    '{completed_nodes}',
    coalesce(target.checkpoint->'completed_nodes', '{}'::jsonb) || jsonb_build_object(p_node_id, p_result),
    true
  );
  if pg_column_size(next_checkpoint) > 65536 then raise exception 'agent checkpoint exceeds storage limit'; end if;
  update public.agent_jobs set checkpoint = next_checkpoint, updated_at = now() where id = target.id;

  if target.cancel_requested then
    update public.agent_jobs set status = 'cancelled', cancel_requested = false, pause_requested = false,
      locked_at = null, locked_by = null, lease_expires_at = null, updated_at = now()
      where id = target.id;
    update public.agent_runs set status = 'cancelled', completed_at = now()
      where id = target.run_id and user_id = target.user_id;
    next_status := 'cancelled';
  elsif target.pause_requested then
    update public.agent_jobs set status = 'paused', pause_requested = false,
      locked_at = null, locked_by = null, lease_expires_at = null, updated_at = now()
      where id = target.id;
    update public.agent_runs set status = 'paused'
      where id = target.run_id and user_id = target.user_id;
    next_status := 'paused';
  end if;

  insert into public.agent_execution_events(run_id, user_id, event_type, payload)
  values (target.run_id, target.user_id, 'checkpoint_saved',
    jsonb_build_object('node_id', p_node_id, 'control', next_status));
  return jsonb_build_object('control', next_status, 'checkpoint', next_checkpoint);
end;
$$;
revoke all on function public.record_agent_execution_checkpoint(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_agent_execution_checkpoint(uuid,text,text,jsonb) to service_role;
