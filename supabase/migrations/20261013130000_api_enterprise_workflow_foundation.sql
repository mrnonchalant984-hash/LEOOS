-- LeonardX API commercial + workflow durability foundation.
-- Additive only. Review and apply via the normal Supabase migration workflow; not run by the app.

create table if not exists public.api_enterprise_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization text not null check (char_length(organization) between 2 and 120),
  work_email text not null check (char_length(work_email) <= 254),
  expected_monthly_requests text not null check (expected_monthly_requests in ('under_100k','100k_1m','1m_10m','over_10m','unknown')),
  use_case text not null check (char_length(use_case) between 20 and 2000),
  status text not null default 'new' check (status in ('new','reviewing','contacted','approved','declined','closed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_enterprise_inquiries_status_created_idx on public.api_enterprise_inquiries(status, created_at desc);
alter table public.api_enterprise_inquiries enable row level security;
drop policy if exists api_enterprise_inquiries_owner_read on public.api_enterprise_inquiries;
create policy api_enterprise_inquiries_owner_read on public.api_enterprise_inquiries for select using (user_id = auth.uid() or public.is_owner(auth.uid()));
-- Writes are server-only through the service role; no user insert/update/delete policy is created.

create table if not exists public.api_plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null check (plan_key in ('developer','launch','growth','scale','enterprise')),
  status text not null default 'pending' check (status in ('pending','active','past_due','cancelled','suspended','expired')),
  currency text not null default 'NGN' check (currency = 'NGN'),
  monthly_amount_minor bigint check (monthly_amount_minor is null or monthly_amount_minor >= 0),
  provider_reference text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_plan_subscriptions_user_status_idx on public.api_plan_subscriptions(user_id,status,current_period_end desc);
alter table public.api_plan_subscriptions enable row level security;
drop policy if exists api_plan_subscriptions_self_read on public.api_plan_subscriptions;
create policy api_plan_subscriptions_self_read on public.api_plan_subscriptions for select using (user_id = auth.uid() or public.is_owner(auth.uid()));
-- Service-role only writes; no client can grant itself a paid tier.

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  trigger_config jsonb not null default '{"type":"manual"}'::jsonb,
  next_run_at timestamptz,
  definition jsonb not null default '{"version":1,"steps":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(trigger_config) = 'object'),
  check (jsonb_typeof(definition) = 'object')
);
create index if not exists workflows_user_updated_idx on public.workflows(user_id,updated_at desc);
create index if not exists workflows_org_updated_idx on public.workflows(organization_id,updated_at desc) where organization_id is not null;
alter table public.workflows enable row level security;
drop policy if exists workflows_owner_all on public.workflows;
create policy workflows_owner_all on public.workflows for all using (user_id = auth.uid() or public.is_owner(auth.uid())) with check (user_id = auth.uid());

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  idempotency_key text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_id,user_id,idempotency_key)
);
create index if not exists workflow_runs_user_created_idx on public.workflow_runs(user_id,created_at desc);
create index if not exists workflow_runs_status_created_idx on public.workflow_runs(status,created_at) where status in ('queued','running');
alter table public.workflow_runs enable row level security;
drop policy if exists workflow_runs_owner_read on public.workflow_runs;
create policy workflow_runs_owner_read on public.workflow_runs for select using (user_id = auth.uid() or public.is_owner(auth.uid()));
-- Only server code may create/update runs; clients cannot forge execution outcomes.

create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.workflow_runs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','leased','completed','dead_letter','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflow_jobs_claim_idx on public.workflow_jobs(status,available_at,created_at) where status in ('queued','leased');
alter table public.workflow_jobs enable row level security;
-- No client policies: worker/service role only.

create or replace function public.enqueue_workflow_run_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'queued' then
    insert into public.workflow_jobs(run_id) values (new.id) on conflict (run_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_run_enqueue_job on public.workflow_runs;
create trigger workflow_run_enqueue_job after insert on public.workflow_runs for each row execute function public.enqueue_workflow_run_job();

create or replace function public.claim_workflow_jobs(p_worker text, p_limit integer default 5, p_lease_seconds integer default 60)
returns setof public.workflow_jobs language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 3 or length(p_worker) > 120 then raise exception 'invalid worker id'; end if;
  if p_limit < 1 or p_limit > 25 or p_lease_seconds < 10 or p_lease_seconds > 900 then raise exception 'invalid claim limits'; end if;
  return query
  with candidates as (
    select j.id from public.workflow_jobs j
    where ((j.status = 'queued' and j.available_at <= now()) or (j.status = 'leased' and j.lease_expires_at < now()))
    order by j.available_at,j.created_at
    limit p_limit for update skip locked
  )
  update public.workflow_jobs j set status='leased', lease_owner=p_worker,
    lease_expires_at=now() + make_interval(secs => p_lease_seconds), attempts=j.attempts+1, updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end;
$$;
revoke all on function public.claim_workflow_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_workflow_jobs(text,integer,integer) to service_role;
revoke all on function public.enqueue_workflow_run_job() from public, anon, authenticated;

-- Interval schedules are enqueued transactionally; SKIP LOCKED prevents duplicate scheduler claims.
create or replace function public.enqueue_due_workflows(p_limit integer default 10)
returns integer language plpgsql security definer set search_path = public as $$
declare
  w record;
  run_id uuid;
  inserted_count integer := 0;
  interval_minutes integer;
  scan_time timestamptz := now();
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'invalid schedule scan limit'; end if;
  for w in
    select id,user_id,trigger_config from public.workflows
    where status = 'active' and trigger_config->>'type' = 'interval' and next_run_at is not null and next_run_at <= scan_time
    order by next_run_at,created_at
    limit p_limit for update skip locked
  loop
    if coalesce(w.trigger_config->>'every_minutes','') ~ '^[0-9]{1,4}$' then
      interval_minutes := greatest(15, least(1440, (w.trigger_config->>'every_minutes')::integer));
    else
      interval_minutes := 60;
    end if;
    insert into public.workflow_runs(workflow_id,user_id,status,input)
      values (w.id,w.user_id,'queued',jsonb_build_object('trigger','interval','scheduled_at',scan_time))
      returning id into run_id;
    update public.workflows set next_run_at = scan_time + make_interval(mins => interval_minutes), updated_at = scan_time where id = w.id;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_due_workflows(integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_workflows(integer) to service_role;

