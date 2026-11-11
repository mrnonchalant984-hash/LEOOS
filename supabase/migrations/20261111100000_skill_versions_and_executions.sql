-- Additive lifecycle data for user-owned skills. Existing skill/file records are preserved.
create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  description text not null,
  files jsonb not null,
  created_at timestamptz not null default now(),
  unique(skill_id, version)
);

create index if not exists skill_versions_owner_created_idx
  on public.skill_versions(owner_id, skill_id, created_at desc);

alter table public.skill_versions enable row level security;
drop policy if exists skill_versions_owner_select on public.skill_versions;
create policy skill_versions_owner_select on public.skill_versions
  for select using (owner_id = auth.uid());

create table if not exists public.skill_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  script_path text not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'timed_out', 'cancelled')),
  exit_code integer,
  stdout text not null default '',
  stderr text not null default '',
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists skill_executions_owner_skill_created_idx
  on public.skill_executions(owner_id, skill_id, created_at desc);

alter table public.skill_executions enable row level security;
drop policy if exists skill_executions_owner_select on public.skill_executions;
create policy skill_executions_owner_select on public.skill_executions
  for select using (owner_id = auth.uid());

create or replace function public.update_user_skill_bundle(
  p_owner_id uuid,
  p_skill_id uuid,
  p_version text,
  p_description text,
  p_files jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_skill public.skills%rowtype;
  current_files jsonb;
begin
  if p_owner_id is null or p_skill_id is null or p_files is null or jsonb_typeof(p_files) <> 'object'
    or not (p_files ? 'SKILL.md') or jsonb_object_length(p_files) > 101 then
    raise exception 'invalid skill bundle';
  end if;

  select * into current_skill from public.skills
    where id = p_skill_id and owner_id = p_owner_id and source = 'user'
    for update;
  if not found then raise exception 'skill not found'; end if;

  select coalesce(jsonb_object_agg(path, content), '{}'::jsonb) into current_files
    from public.skill_files where skill_id = p_skill_id and content is not null;

  if p_version = current_skill.version and (p_description is distinct from current_skill.description or p_files is distinct from current_files) then
    raise exception 'skill content changes require a new version';
  end if;
  if exists (select 1 from public.skill_versions where skill_id = p_skill_id and version = p_version and files <> p_files) then
    raise exception 'skill version already exists with different content';
  end if;

  insert into public.skill_versions(skill_id, owner_id, version, description, files)
  values (p_skill_id, p_owner_id, current_skill.version, current_skill.description, current_files)
  on conflict (skill_id, version) do nothing;

  update public.skills set version = p_version, description = p_description
    where id = p_skill_id and owner_id = p_owner_id;
  delete from public.skill_files where skill_id = p_skill_id;
  insert into public.skill_files(skill_id, path, content)
    select p_skill_id, key, value from jsonb_each_text(p_files);

  insert into public.skill_versions(skill_id, owner_id, version, description, files)
  values (p_skill_id, p_owner_id, p_version, p_description, p_files)
  on conflict (skill_id, version) do nothing;

  return jsonb_build_object('id', current_skill.id, 'name', current_skill.name,
    'description', p_description, 'version', p_version, 'enabled', current_skill.enabled, 'source', current_skill.source);
end;
$$;

revoke all on function public.update_user_skill_bundle(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.update_user_skill_bundle(uuid,uuid,text,text,jsonb) to service_role;
