-- Persistent autonomous engineering workflows for LeonardX.
-- Additive only. Does not drop tables or rewrite migration history.

create table if not exists public.engineering_workflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  website_project_id uuid references public.website_projects(id) on delete set null,
  mode text not null check (mode in ('discovery', 'autonomous')),
  status text not null check (status in ('PENDING', 'RUNNING', 'WAITING_FOR_USER', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED')),
  current_stage text,
  title text not null,
  summary text,
  strategy jsonb,
  budget_tier text,
  budget_amount numeric,
  budget_currency text,
  stages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists idx_engineering_workflows_owner_updated
  on public.engineering_workflows(owner_user_id, updated_at desc);

create index if not exists idx_engineering_workflows_project
  on public.engineering_workflows(website_project_id, updated_at desc)
  where website_project_id is not null;

create table if not exists public.engineering_workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.engineering_workflows(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  stage text,
  event_type text not null,
  message text not null,
  artifacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_engineering_workflow_events_workflow_created
  on public.engineering_workflow_events(workflow_id, created_at desc);

create table if not exists public.secure_config_audit (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  website_project_id uuid references public.website_projects(id) on delete set null,
  variable_name text not null,
  target_env text not null,
  result text not null check (result in ('success', 'failed')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_secure_config_audit_owner_created
  on public.secure_config_audit(owner_user_id, created_at desc);

alter table public.engineering_workflows enable row level security;
alter table public.engineering_workflow_events enable row level security;
alter table public.secure_config_audit enable row level security;

drop policy if exists engineering_workflows_owner_select on public.engineering_workflows;
create policy engineering_workflows_owner_select
  on public.engineering_workflows for select
  using (auth.uid() = owner_user_id);

drop policy if exists engineering_workflows_owner_insert on public.engineering_workflows;
create policy engineering_workflows_owner_insert
  on public.engineering_workflows for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists engineering_workflows_owner_update on public.engineering_workflows;
create policy engineering_workflows_owner_update
  on public.engineering_workflows for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists engineering_workflow_events_owner_select on public.engineering_workflow_events;
create policy engineering_workflow_events_owner_select
  on public.engineering_workflow_events for select
  using (auth.uid() = owner_user_id);

drop policy if exists engineering_workflow_events_owner_insert on public.engineering_workflow_events;
create policy engineering_workflow_events_owner_insert
  on public.engineering_workflow_events for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists secure_config_audit_owner_select on public.secure_config_audit;
create policy secure_config_audit_owner_select
  on public.secure_config_audit for select
  using (auth.uid() = owner_user_id);

-- Prevent concurrent destructive jobs against the same website project.
create unique index if not exists uniq_engineering_workflows_active_deploy_or_migrate
  on public.engineering_workflows(website_project_id)
  where website_project_id is not null
    and status in ('RUNNING', 'WAITING_FOR_USER', 'BLOCKED')
    and current_stage in ('MIGRATION_EXECUTION', 'DEPLOYMENT');
