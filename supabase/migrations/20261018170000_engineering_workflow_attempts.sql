-- Durable, owner-scoped execution records for MCP orchestration retries.
create table if not exists public.engineering_workflow_attempts (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.engineering_workflows(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null,
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED')),
  idempotency_key text not null,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_id, stage, idempotency_key)
);

create index if not exists engineering_workflow_attempts_owner_idx
  on public.engineering_workflow_attempts(owner_user_id, created_at desc);

alter table public.engineering_workflow_attempts enable row level security;

drop policy if exists engineering_workflow_attempts_owner_select on public.engineering_workflow_attempts;
create policy engineering_workflow_attempts_owner_select
  on public.engineering_workflow_attempts for select
  using (owner_user_id = auth.uid());

comment on table public.engineering_workflow_attempts is
  'Non-secret, owner-scoped audit records for safe MCP workflow retries.';
