-- Project-owned image assets for Godot game workspaces. The asset source stays
-- in the existing private leo-files bucket; this table only attaches it safely.
create table if not exists public.godot_project_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  project_path text not null check (
    char_length(project_path) <= 240 and
    project_path ~ '^assets/[A-Za-z0-9][A-Za-z0-9_. -]{0,79}(/[A-Za-z0-9][A-Za-z0-9_. -]{0,79})*$' and
    project_path !~ '(^|/)\.\.?(/|$)' and
    project_path !~ '(^|/)\.env($|\.)'
  ),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(project_id, project_path)
);

create index if not exists godot_project_assets_owner_project_idx
  on public.godot_project_assets(owner_user_id, project_id, created_at desc);

alter table public.godot_project_assets enable row level security;
drop policy if exists godot_project_assets_owner_select on public.godot_project_assets;
create policy godot_project_assets_owner_select on public.godot_project_assets
  for select using (auth.uid() = owner_user_id);
revoke all on public.godot_project_assets from anon, authenticated;
grant select on public.godot_project_assets to authenticated;

create or replace function public.attach_godot_project_asset(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_asset_id uuid,
  p_project_path text,
  p_sha256 text
) returns table(asset_link_id uuid, project_path text, mime_type text, size_bytes bigint)
language plpgsql security definer set search_path = public as $$
declare
  project_owner uuid;
  project_type text;
  asset_owner uuid;
  asset_bucket text;
  asset_kind text;
  asset_mime text;
  asset_size bigint;
  existing_count integer;
  existing_size bigint;
  link_id uuid;
begin
  if p_owner_user_id is null or p_project_id is null or p_asset_id is null or
     p_project_path is null or p_project_path !~ '^assets/[A-Za-z0-9][A-Za-z0-9_. -]{0,79}(/[A-Za-z0-9][A-Za-z0-9_. -]{0,79})*$' or
     p_project_path ~ '(^|/)\.\.?(/|$)' or p_project_path ~ '(^|/)\.env($|\.)' or char_length(p_project_path) > 240 or
     p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Godot project asset.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 3));
  select p.user_id, p.type into project_owner, project_type from projects p where p.id = p_project_id;
  if project_owner is distinct from p_owner_user_id or project_type <> 'game' then
    raise exception 'Game project not found.';
  end if;

  select a.user_id, a.bucket, a.kind, a.mime_type, a.size_bytes
    into asset_owner, asset_bucket, asset_kind, asset_mime, asset_size
    from media_assets a where a.id = p_asset_id;
  if asset_owner is distinct from p_owner_user_id or asset_bucket <> 'leo-files' or asset_kind <> 'image' or
     asset_mime not in ('image/png', 'image/jpeg', 'image/webp') or asset_size < 1 or asset_size > 2000000 then
    raise exception 'Unsupported or unauthorized Godot project image.';
  end if;

  select count(*)::integer, coalesce(sum(a.size_bytes), 0)::bigint
    into existing_count, existing_size
    from godot_project_assets g join media_assets a on a.id = g.asset_id
    where g.project_id = p_project_id and g.project_path <> p_project_path;
  if existing_count >= 20 then raise exception 'Godot project asset count limit reached.'; end if;
  if existing_size + asset_size > 2000000 then raise exception 'Godot project asset size limit reached.'; end if;

  insert into godot_project_assets(owner_user_id, project_id, asset_id, project_path, sha256)
    values(p_owner_user_id, p_project_id, p_asset_id, p_project_path, p_sha256)
    on conflict(project_id, project_path) do update set
      owner_user_id = excluded.owner_user_id,
      asset_id = excluded.asset_id,
      sha256 = excluded.sha256,
      created_at = now()
    returning id into link_id;
  return query select link_id, p_project_path, asset_mime, asset_size;
end;
$$;

revoke all on function public.attach_godot_project_asset(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_godot_project_asset(uuid, uuid, uuid, text, text) to service_role;
