-- MCP-originated inference and agent work use owner-scoped idempotency records.
alter table public.agent_runs
  add column if not exists idempotency_key uuid;

create unique index if not exists agent_runs_user_idempotency_idx
  on public.agent_runs(user_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.mcp_ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  session_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'running' check (status in ('running','completed','failed')),
  provider text,
  model text,
  response_text text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index if not exists mcp_ai_requests_user_created_idx
  on public.mcp_ai_requests(user_id, created_at desc);

alter table public.mcp_ai_requests enable row level security;
drop policy if exists mcp_ai_requests_owner_select on public.mcp_ai_requests;
create policy mcp_ai_requests_owner_select on public.mcp_ai_requests
  for select using (auth.uid() = user_id);
revoke all on public.mcp_ai_requests from public, anon, authenticated;
grant select on public.mcp_ai_requests to authenticated;
grant all on public.mcp_ai_requests to service_role;

create or replace function public.cancel_queued_agent_run(p_run_id uuid, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  run_status text;
  job_status text;
  changed integer;
begin
  if p_run_id is null or p_user_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));
  select status into run_status from public.agent_runs
    where id = p_run_id and user_id = p_user_id for update;
  if run_status is distinct from 'queued' then return false; end if;
  select status into job_status from public.agent_jobs
    where run_id = p_run_id and user_id = p_user_id for update;
  if job_status is distinct from 'queued' then return false; end if;
  update public.agent_jobs set status = 'cancelled', locked_at = null, locked_by = null,
    lease_expires_at = null, updated_at = now()
    where run_id = p_run_id and user_id = p_user_id and status = 'queued';
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;
  update public.agent_runs set status = 'cancelled', completed_at = now()
    where id = p_run_id and user_id = p_user_id and status = 'queued';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.cancel_queued_agent_run(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cancel_queued_agent_run(uuid,uuid) to service_role;
