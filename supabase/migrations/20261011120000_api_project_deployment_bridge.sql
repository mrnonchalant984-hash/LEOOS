-- Link API-created developer projects to the existing website build/deployment
-- pipeline without duplicating project or build tables.
alter table public.website_projects
  add column if not exists source_project_id uuid references public.projects(id) on delete set null;

create unique index if not exists idx_website_projects_source_project
  on public.website_projects(source_project_id)
  where source_project_id is not null;
