create table if not exists public.plugin_executions (
  id uuid primary key default gen_random_uuid(),
  plugin_id text not null,
  version text not null,
  action text not null check (char_length(action) between 1 and 80),
  request_id text not null,
  status text not null check (status in ('started', 'succeeded', 'failed', 'timed_out')),
  response_status integer,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint plugin_executions_manifest_fk
    foreign key (plugin_id, version)
    references public.plugin_manifests(plugin_id, version)
    on delete restrict
);

create index if not exists plugin_executions_lookup_idx
  on public.plugin_executions(plugin_id, version, created_at desc);

alter table public.plugin_executions enable row level security;
revoke all on table public.plugin_executions from public, anon, authenticated;
grant select, insert, update on table public.plugin_executions to service_role;
