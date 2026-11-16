-- Stores only the isolated runner's tenant-scoped workspace handle and source revision.
-- No source files or secrets are copied into this table.
alter table public.project_workspace_sources
  add column if not exists runtime_workspace_id uuid,
  add column if not exists runtime_revision bigint,
  add column if not exists runtime_updated_at timestamptz;

comment on column public.project_workspace_sources.runtime_workspace_id is
  'Opaque handle for the short-lived isolated runner workspace; not a public URL or credential.';
