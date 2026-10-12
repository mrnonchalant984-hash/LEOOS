-- Additive reliability controls. Apply through the reviewed Supabase migration flow.
-- This migration is intentionally not executed by the application.

-- Organization membership is reusable by every server-side tenant check.
create or replace function public.is_organization_member(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and (o.owner_user_id = p_user_id or exists (
        select 1 from public.organization_members m
        where m.organization_id = o.id and m.user_id = p_user_id
      ) or public.is_owner(p_user_id))
  );
$$;
revoke all on function public.is_organization_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_organization_member(uuid, uuid) to service_role;

-- Existing personal projects remain owner-isolated. New workspace-aware records may
-- opt into an organization without rewriting production ownership data.
alter table public.website_projects add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.project_builds add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.agent_runs add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.webhooks add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_website_projects_organization on public.website_projects(organization_id, created_at desc);
create index if not exists idx_project_builds_organization on public.project_builds(organization_id, created_at desc);
create index if not exists idx_agent_runs_organization on public.agent_runs(organization_id, created_at desc);
create index if not exists idx_webhooks_organization on public.webhooks(organization_id, created_at desc);

-- Serverless-safe limits by arbitrary subject: user, organization, IP, API key,
-- provider, or a combined cost class. Only service_role can consume buckets.
create table if not exists public.rate_limit_buckets (
  subject_key text not null,
  bucket text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_key, bucket)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant all on table public.rate_limit_buckets to service_role;

create or replace function public.consume_rate_limit_bucket(
  p_subject_key text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer; now_ts timestamptz := clock_timestamp();
begin
  if p_subject_key is null or length(p_subject_key) not between 1 and 180
     or p_bucket is null or length(p_bucket) not between 1 and 80
     or p_limit is null or p_limit < 1 or p_limit > 1000000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters';
  end if;
  insert into public.rate_limit_buckets(subject_key,bucket,window_started_at,request_count,updated_at)
    values(p_subject_key,p_bucket,now_ts,1,now_ts)
  on conflict(subject_key,bucket) do update set
    window_started_at = case when rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds) <= now_ts then now_ts else rate_limit_buckets.window_started_at end,
    request_count = case when rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds) <= now_ts then 1 else least(p_limit + 1, rate_limit_buckets.request_count + 1) end,
    updated_at = now_ts
  returning request_count into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit_bucket(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit_bucket(text,text,integer,integer) to service_role;

-- Payment lifecycle audit fields. Existing rows are preserved.
alter table public.subscriptions add column if not exists provider_status text;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists cancellation_requested_at timestamptz;
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.payments add column if not exists provider_event_id text;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists refund_reference text;
create unique index if not exists idx_payments_provider_event_id on public.payments(provider_event_id) where provider_event_id is not null;

-- Durable agent queue records. Execution stays disabled until a protected worker is deployed.
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.agent_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agent_jobs_queue on public.agent_jobs(status, available_at, created_at);
alter table public.agent_jobs enable row level security;
revoke all on table public.agent_jobs from public, anon, authenticated;
grant all on table public.agent_jobs to service_role;
