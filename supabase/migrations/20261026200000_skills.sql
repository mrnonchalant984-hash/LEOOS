create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  description text not null,
  version text not null,
  enabled boolean not null default true,
  source text not null default 'user' check (source in ('user','plugin')),
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);
create table if not exists public.skill_files (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  path text not null,
  content text,
  storage_url text,
  created_at timestamptz not null default now(),
  unique(skill_id, path),
  check (content is not null or storage_url is not null)
);
alter table public.skills enable row level security;
alter table public.skill_files enable row level security;
create policy skills_owner_select on public.skills for select using (owner_id = auth.uid());
create policy skills_owner_write on public.skills for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy skill_files_owner_select on public.skill_files for select using (exists (select 1 from public.skills s where s.id = skill_id and s.owner_id = auth.uid()));
create policy skill_files_owner_write on public.skill_files for all using (exists (select 1 from public.skills s where s.id = skill_id and s.owner_id = auth.uid())) with check (exists (select 1 from public.skills s where s.id = skill_id and s.owner_id = auth.uid()));
