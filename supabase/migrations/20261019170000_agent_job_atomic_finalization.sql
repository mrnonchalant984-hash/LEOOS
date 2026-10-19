-- Finalize an agent job and its run in one transaction. The current lease owner
-- is required so a timed-out/stale worker cannot overwrite a later attempt.
create or replace function public.finalize_agent_job(
  p_job_id uuid,
  p_worker text,
  p_run_status text,
  p_job_status text,
  p_result text default null,
  p_run_error text default null,
  p_job_error text default null,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.agent_jobs%rowtype;
begin
  if p_job_id is null or p_worker is null or length(p_worker) < 8 or length(p_worker) > 120 then
    raise exception 'invalid worker identity';
  end if;
  if p_run_status not in ('queued','completed','failed','waiting_approval') then
    raise exception 'invalid run status';
  end if;
  if p_job_status not in ('queued','succeeded','failed') then
    raise exception 'invalid job status';
  end if;
  if p_job_status = 'queued' and p_retry_at is null then
    raise exception 'retry timestamp required';
  end if;
  if p_job_status = 'succeeded' and p_run_status <> 'completed' then
    raise exception 'successful job must complete its run';
  end if;

  select * into target
    from public.agent_jobs
   where id = p_job_id and status = 'running' and locked_by = p_worker
     and lease_expires_at > now()
   for update;
  if not found then
    return false;
  end if;

  -- Both records are updated in this transaction; a partial completion cannot
  -- cause a completed provider operation to be blindly requeued.
  update public.agent_runs
     set status = p_run_status,
         result = case when p_result is not null then p_result else result end,
         error = p_run_error,
         completed_at = case when p_run_status in ('completed','failed') then now() else null end
   where id = target.run_id and user_id = target.user_id;
  if not found then
    raise exception 'agent run not found for claimed job';
  end if;

  update public.agent_jobs
     set status = p_job_status,
         available_at = coalesce(p_retry_at, available_at),
         last_error = p_job_error,
         locked_at = null,
         locked_by = null,
         lease_expires_at = null,
         updated_at = now()
   where id = target.id and status = 'running' and locked_by = p_worker;
  if not found then
    raise exception 'claimed agent job changed during finalization';
  end if;
  return true;
end;
$$;

revoke all on function public.finalize_agent_job(uuid,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_agent_job(uuid,text,text,text,text,text,text,timestamptz) to service_role;
