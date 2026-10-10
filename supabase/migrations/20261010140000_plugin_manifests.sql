-- Durable trusted plugin metadata only. This table does not execute plugin code.
create table if not exists public.plugin_manifests (
  plugin_id text not null check (plugin_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  api_version text not null check (api_version = '1'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  status text not null default 'registered'
    check (status in ('registered', 'enabled', 'disabled', 'deprecated')),
  registered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plugin_id, version),
  constraint plugin_manifests_payload_matches_key check (
    manifest->>'id' = plugin_id
    and manifest->>'version' = version
    and manifest->>'apiVersion' = api_version
  )
);

create index if not exists plugin_manifests_status_idx
  on public.plugin_manifests(status, plugin_id, created_at desc);
create unique index if not exists plugin_manifests_one_enabled_version_idx
  on public.plugin_manifests(plugin_id) where status = 'enabled';

alter table public.plugin_manifests enable row level security;
revoke all on table public.plugin_manifests from public, anon, authenticated;
grant select, insert, update, delete on table public.plugin_manifests to service_role;
