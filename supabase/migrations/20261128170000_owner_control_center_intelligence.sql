-- Additive Owner Control Center intelligence foundation.
-- Historical AI rows are intentionally left unpriced unless verified model pricing
-- and the contemporaneous FX rate are available. No model price or credit rate is guessed.

create table if not exists public.ai_model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  service_tier text not null check (service_tier in ('free','paid')),
  input_usd_per_million numeric(24,12) not null check (input_usd_per_million >= 0),
  output_usd_per_million numeric(24,12) not null check (output_usd_per_million >= 0),
  cached_input_usd_per_million numeric(24,12) check (cached_input_usd_per_million is null or cached_input_usd_per_million >= 0),
  effective_at timestamptz not null,
  effective_until timestamptz,
  source_url text,
  source_note text,
  verified_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_at),
  unique(provider, model, service_tier, effective_at)
);
create index if not exists ai_model_pricing_lookup_idx
  on public.ai_model_pricing(provider, model, service_tier, effective_at desc)
  where active;

create table if not exists public.ai_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD' check (base_currency = 'USD'),
  quote_currency text not null default 'NGN' check (quote_currency = 'NGN'),
  rate numeric(24,10) not null check (rate > 0),
  source text not null,
  source_url text,
  source_note text,
  observed_at timestamptz not null,
  is_manual_override boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_exchange_rates_observed_idx
  on public.ai_exchange_rates(base_currency, quote_currency, observed_at desc);

create table if not exists public.ai_usage_financials (
  ai_usage_id uuid primary key references public.ai_usage(id) on delete cascade,
  provider text not null default 'unknown',
  model text,
  service_tier text not null default 'unknown' check (service_tier in ('free','paid','unknown')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  pricing_id uuid references public.ai_model_pricing(id),
  input_usd_per_million numeric(24,12),
  output_usd_per_million numeric(24,12),
  cached_input_usd_per_million numeric(24,12),
  estimated_usd numeric(30,12),
  actual_usd numeric(30,12),
  fx_rate_id uuid references public.ai_exchange_rates(id),
  usd_ngn_rate numeric(24,10),
  estimated_ngn numeric(30,8),
  actual_ngn numeric(30,8),
  pricing_status text not null default 'unpriced'
    check (pricing_status in ('priced','free_tier','unpriced','unknown_tier')),
  actual_cost_status text not null default 'not_reported'
    check (actual_cost_status in ('provider_reported','zero_confirmed','not_reported')),
  created_at timestamptz not null default now(),
  check (estimated_usd is null or estimated_usd >= 0),
  check (actual_usd is null or actual_usd >= 0)
);
create index if not exists ai_usage_financials_provider_idx
  on public.ai_usage_financials(provider, model, created_at desc);

-- Legacy rows are imported as unpriced. A model prefix is not treated as proof
-- of a billable tier or a historical price.
insert into public.ai_usage_financials(ai_usage_id, provider, model, input_tokens, output_tokens, pricing_status)
select u.id,
       case when position('/' in coalesce(u.model,'')) > 0 then split_part(u.model,'/',1) else 'unknown' end,
       u.model,
       greatest(coalesce(u.prompt_tokens,0),0),
       greatest(coalesce(u.completion_tokens,0),0),
       'unpriced'
from public.ai_usage u
where coalesce(u.total_tokens,0) > 0
  and coalesce(u.feature,'') not like 'image_%'
  and coalesce(u.metadata->>'request_status','completed') <> 'failed'
  and coalesce(u.metadata->>'status','completed') <> 'failed'
on conflict (ai_usage_id) do nothing;

create table if not exists public.ai_credit_conversion_policy (
  policy_key text primary key default 'default' check (policy_key = 'default'),
  input_token_weight numeric(12,8),
  output_token_weight numeric(12,8),
  cached_input_token_weight numeric(12,8),
  tokens_per_credit numeric(24,8),
  minimum_billable_tokens integer not null default 0 check (minimum_billable_tokens >= 0),
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (input_token_weight is null or input_token_weight >= 0),
  check (output_token_weight is null or output_token_weight >= 0),
  check (cached_input_token_weight is null or cached_input_token_weight >= 0),
  check (tokens_per_credit is null or tokens_per_credit > 0),
  check (not enabled or (input_token_weight is not null and output_token_weight is not null and tokens_per_credit is not null))
);
insert into public.ai_credit_conversion_policy(policy_key, enabled)
values ('default', false) on conflict (policy_key) do nothing;

create table if not exists public.ai_usage_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  ai_usage_id uuid not null references public.ai_usage(id),
  user_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('charge','reversal','reconciliation')),
  credits_delta bigint not null check (credits_delta <> 0),
  idempotency_key text not null unique,
  policy_snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_credit_ledger_user_idx
  on public.ai_usage_credit_ledger(user_id, created_at desc);

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('ai','hosting','database','storage','infrastructure','domain','email','notifications','other')),
  description text not null check (char_length(description) between 1 and 500),
  amount numeric(24,8) not null check (amount > 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  amount_ngn numeric(24,8),
  fx_rate_id uuid references public.ai_exchange_rates(id),
  vendor text,
  reference text,
  incurred_at date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_expenses_incurred_idx
  on public.business_expenses(incurred_at desc, category);

-- These records are owner-only. Service-role APIs enforce the same owner + trusted
-- device check before reading or writing; RLS is defense in depth.
alter table public.ai_model_pricing enable row level security;
alter table public.ai_exchange_rates enable row level security;
alter table public.ai_usage_financials enable row level security;
alter table public.ai_credit_conversion_policy enable row level security;
alter table public.ai_usage_credit_ledger enable row level security;
alter table public.business_expenses enable row level security;

revoke all on public.ai_model_pricing, public.ai_exchange_rates, public.ai_usage_financials,
  public.ai_credit_conversion_policy, public.ai_usage_credit_ledger, public.business_expenses
  from anon, authenticated;
grant all on public.ai_model_pricing, public.ai_exchange_rates, public.ai_usage_financials,
  public.ai_credit_conversion_policy, public.ai_usage_credit_ledger, public.business_expenses
  to service_role;

create or replace function public.prevent_ai_financial_ledger_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Financial ledger rows are immutable; append a reversal instead.';
end;
$$;
drop trigger if exists ai_usage_credit_ledger_immutable on public.ai_usage_credit_ledger;
create trigger ai_usage_credit_ledger_immutable
before update or delete on public.ai_usage_credit_ledger
for each row execute function public.prevent_ai_financial_ledger_mutation();
