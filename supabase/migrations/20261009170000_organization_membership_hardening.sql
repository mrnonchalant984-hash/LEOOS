-- Additive organization/workspace primitives. Review and apply through the normal migration process.
alter table public.projects add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_projects_organization on public.projects(organization_id, created_at desc);
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null, role text not null default 'VIEWER', invited_by uuid not null references public.profiles(id), expires_at timestamptz not null default (now() + interval '7 days'), accepted_at timestamptz, created_at timestamptz not null default now(),
  unique(organization_id, email)
);
alter table public.organization_invitations enable row level security;
drop policy if exists organization_invitations_owner on public.organization_invitations;
create policy organization_invitations_owner on public.organization_invitations for all using(exists(select 1 from public.organizations o where o.id=organization_id and (o.owner_user_id=auth.uid() or public.is_owner(auth.uid())))) with check(exists(select 1 from public.organizations o where o.id=organization_id and (o.owner_user_id=auth.uid() or public.is_owner(auth.uid()))));
