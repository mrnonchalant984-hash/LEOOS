-- LEO OS webhook endpoints/delivery compatibility migration.
-- The remote database already contained an older webhook_deliveries table,
-- so this migration upgrades it additively instead of replacing it.

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  description text,
  events text[] not null default '{}',
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists webhook_endpoints_user_idx
  on public.webhook_endpoints(user_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  user_id uuid not null,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  response_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

do $$
begin
  if to_regclass('public.webhook_deliveries') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='endpoint_id'
    ) then
      alter table public.webhook_deliveries add column endpoint_id uuid;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='user_id'
    ) then alter table public.webhook_deliveries add column user_id uuid; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='event'
    ) then alter table public.webhook_deliveries add column event text; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='payload'
    ) then alter table public.webhook_deliveries add column payload jsonb; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='status'
    ) then alter table public.webhook_deliveries add column status text default 'pending'; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='attempts'
    ) then alter table public.webhook_deliveries add column attempts integer default 0; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='next_attempt_at'
    ) then alter table public.webhook_deliveries add column next_attempt_at timestamptz; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='response_status'
    ) then alter table public.webhook_deliveries add column response_status integer; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='last_error'
    ) then alter table public.webhook_deliveries add column last_error text; end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='created_at'
    ) then alter table public.webhook_deliveries add column created_at timestamptz default now(); end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='webhook_deliveries' and column_name='delivered_at'
    ) then alter table public.webhook_deliveries add column delivered_at timestamptz; end if;
  end if;
end
$$;

create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries(status, next_attempt_at);

create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries(endpoint_id, created_at desc);

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_self_select on public.webhook_deliveries;
create policy webhook_deliveries_self_select
  on public.webhook_deliveries
  for select
  using (auth.uid() = user_id);
