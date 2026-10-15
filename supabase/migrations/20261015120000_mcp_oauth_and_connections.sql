-- OAuth credentials and outbound MCP tool registrations.
-- All rows are service-role-only; access is enforced by the server endpoints.

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  state text not null,
  code_challenge text not null,
  scope text not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_authorization_requests_expiry
  on public.mcp_oauth_authorization_requests(expires_at);

create table if not exists public.mcp_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_authorization_codes_expiry
  on public.mcp_oauth_authorization_codes(expires_at);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_tokens_user_active
  on public.mcp_oauth_tokens(user_id, expires_at desc)
  where revoked_at is null;

create table if not exists public.mcp_remote_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  credential_ciphertext text,
  discovered_tools jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists mcp_remote_servers_user
  on public.mcp_remote_servers(user_id, created_at desc);

create table if not exists public.mcp_remote_tool_approvals (
  server_id uuid not null references public.mcp_remote_servers(id) on delete cascade,
  tool_name text not null,
  approved_at timestamptz not null default now(),
  primary key (server_id, tool_name)
);

create table if not exists public.mcp_tool_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid references public.mcp_remote_servers(id) on delete set null,
  tool_name text not null,
  outcome text not null check (outcome in ('success','error','denied')),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tool_audit_user_created
  on public.mcp_tool_audit(user_id, created_at desc);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_authorization_requests enable row level security;
alter table public.mcp_oauth_authorization_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_remote_servers enable row level security;
alter table public.mcp_remote_tool_approvals enable row level security;
alter table public.mcp_tool_audit enable row level security;

revoke all on public.mcp_oauth_clients, public.mcp_oauth_authorization_requests,
  public.mcp_oauth_authorization_codes, public.mcp_oauth_tokens,
  public.mcp_remote_servers, public.mcp_remote_tool_approvals,
  public.mcp_tool_audit from anon, authenticated;
grant all on public.mcp_oauth_clients, public.mcp_oauth_authorization_requests,
  public.mcp_oauth_authorization_codes, public.mcp_oauth_tokens,
  public.mcp_remote_servers, public.mcp_remote_tool_approvals,
  public.mcp_tool_audit to service_role;
