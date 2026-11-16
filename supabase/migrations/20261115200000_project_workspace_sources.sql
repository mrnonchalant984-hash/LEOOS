-- Durable source archives for user-owned Work-mode project workspaces.
-- Archive bytes live in the existing private leo-files Storage bucket.
create table if not exists public.project_workspace_sources (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  revision bigint not null default 0 check (revision >= 0),
  file_count integer not null default 0 check (file_count >= 0 and file_count <= 1500),
  total_bytes bigint not null default 0 check (total_bytes >= 0 and total_bytes <= 52428800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_workspace_sources_path_owner check (
    storage_path is null or storage_path like ('project-workspaces/' || user_id::text || '/' || project_id::text || '/%')
  )
);
create index if not exists project_workspace_sources_user_updated_idx
  on public.project_workspace_sources(user_id, updated_at desc);
alter table public.project_workspace_sources enable row level security;
drop policy if exists "Users can read their own project workspace metadata" on public.project_workspace_sources;
create policy "Users can read their own project workspace metadata"
  on public.project_workspace_sources for select to authenticated using (auth.uid() = user_id);
-- Writes are performed by authenticated server routes using the service role after
-- checking project ownership. No direct client write policy is intentionally added.
comment on table public.project_workspace_sources is
  'Revisioned private source archives for durable editable LeonardX Work-mode project workspaces.';
