-- Short-lived, single-use OAuth state records. State values are SHA-256 hashed at rest.
create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','vercel','firebase','youtube','meta','whatsapp_business')),
  label text not null check (char_length(label) between 1 and 100),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists integration_oauth_states_expiry_idx on public.integration_oauth_states(expires_at);
alter table public.integration_oauth_states enable row level security;
revoke all on public.integration_oauth_states from anon, authenticated;

-- Auditable record of user-requested database migrations; SQL contents and credentials are not stored.
create table if not exists public.integration_migration_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.user_integrations(id) on delete cascade,
  project_ref text not null,
  migration_name text not null check (char_length(migration_name) between 1 and 120),
  sql_sha256 text not null check (sql_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('succeeded','failed')),
  created_at timestamptz not null default now()
);
create index if not exists integration_migration_runs_user_idx on public.integration_migration_runs(user_id, created_at desc);
alter table public.integration_migration_runs enable row level security;
revoke all on public.integration_migration_runs from anon, authenticated;

-- Auditable record of user-requested database migrations; SQL contents and credentials are not stored.
create table if not exists public.integration_migration_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.user_integrations(id) on delete cascade,
  project_ref text not null,
  migration_name text not null check (char_length(migration_name) between 1 and 120),
  sql_sha256 text not null check (sql_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('succeeded','failed')),
  created_at timestamptz not null default now()
);
create index if not exists integration_migration_runs_user_idx on public.integration_migration_runs(user_id, created_at desc);
alter table public.integration_migration_runs enable row level security;
revoke all on public.integration_migration_runs from anon, authenticated;
