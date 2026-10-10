-- Request outcome logs used by the API v1 handlers. No request body or API key is stored.
create table if not exists public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references public.api_keys(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id text not null,
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  route text not null,
  status_code integer not null check (status_code between 100 and 599),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists api_request_logs_user_created_idx
  on public.api_request_logs(user_id, created_at desc);
create index if not exists api_request_logs_key_created_idx
  on public.api_request_logs(key_id, created_at desc);

alter table public.api_request_logs enable row level security;
revoke all on table public.api_request_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.api_request_logs to service_role;
