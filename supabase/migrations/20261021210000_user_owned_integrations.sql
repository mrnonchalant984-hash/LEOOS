-- Customer-owned integration credentials. Secrets are AES-GCM encrypted by the application
-- before they reach this table; raw credentials are never returned by API routes.
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in (
    'github','vercel','supabase','firebase','openai','anthropic','google_gemini',
    'whatsapp_business','meta','youtube','custom_mcp'
  )),
  label text not null check (char_length(label) between 1 and 100),
  credential_ciphertext text not null,
  status text not null default 'configured' check (status in ('configured','verified','verification_failed')),
  scopes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, label)
);
create index if not exists user_integrations_user_provider_idx
  on public.user_integrations(user_id, provider, created_at desc);
alter table public.user_integrations enable row level security;
-- All secret-bearing operations go through authenticated server routes using the service role
-- with explicit user_id predicates. Direct client access is intentionally denied.
revoke all on public.user_integrations from anon, authenticated;
