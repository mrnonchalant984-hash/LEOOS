create table if not exists public.developer_custom_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 50),
  description text not null check (char_length(description) between 1 and 200),
  instructions text not null check (char_length(instructions) between 30 and 4000),
  allowed_tools text[] not null default '{}' check (cardinality(allowed_tools) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists developer_custom_agents_user_name_idx
  on public.developer_custom_agents(user_id, lower(name));
create index if not exists developer_custom_agents_user_created_idx
  on public.developer_custom_agents(user_id, created_at desc);

alter table public.developer_custom_agents enable row level security;
revoke all on table public.developer_custom_agents from public, anon, authenticated;
grant select, insert, update, delete on table public.developer_custom_agents to service_role;
