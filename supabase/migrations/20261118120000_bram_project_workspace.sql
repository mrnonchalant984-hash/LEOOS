-- Persistent Bram architecture checklists and project-specific research resources.
create table if not exists public.bram_project_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Implementation checklist' check (char_length(title) between 1 and 160),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists bram_project_checklists_user_updated_idx
  on public.bram_project_checklists(user_id, updated_at desc);
alter table public.bram_project_checklists enable row level security;
drop policy if exists "Users read own Bram project checklists" on public.bram_project_checklists;
create policy "Users read own Bram project checklists" on public.bram_project_checklists
  for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_project_checklists to authenticated;
grant select, insert, update, delete on public.bram_project_checklists to service_role;

create table if not exists public.bram_project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  url text not null check (char_length(url) between 8 and 2048),
  publisher text,
  description text,
  source_type text not null default 'research' check (source_type in ('research','documentation','reference','other')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, url)
);
create index if not exists bram_project_resources_user_project_idx
  on public.bram_project_resources(user_id, project_id, created_at desc);
alter table public.bram_project_resources enable row level security;
drop policy if exists "Users read own Bram project resources" on public.bram_project_resources;
create policy "Users read own Bram project resources" on public.bram_project_resources
  for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_project_resources to authenticated;
grant select, insert, update, delete on public.bram_project_resources to service_role;
