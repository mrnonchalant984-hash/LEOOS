-- Additive LeonardX generation, private-media, and one-time welcome-credit support.
-- Existing subscription/feature credits and balances are deliberately preserved.
create table if not exists public.platform_credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  total_granted bigint not null default 0 check (total_granted >= 0),
  total_spent bigint not null default 0 check (total_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_key text not null,
  job_type text not null check (job_type in ('image','video')),
  provider text not null,
  model text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  prompt text not null,
  provider_task_id text,
  credit_source text check (credit_source in ('platform','legacy_feature')),
  platform_credits_reserved integer not null default 0 check (platform_credits_reserved >= 0),
  platform_credits_charged integer not null default 0 check (platform_credits_charged >= 0),
  provider_cost_usd numeric(12,6),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, request_key)
);
create index if not exists idx_generation_jobs_user_created on public.generation_jobs(user_id, created_at desc);
create index if not exists idx_generation_jobs_provider_task on public.generation_jobs(provider, provider_task_id) where provider_task_id is not null;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete set null,
  kind text not null check (kind in ('image','video','audio','other')),
  bucket text not null default 'leo-files',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bucket, storage_path)
);
create index if not exists idx_media_assets_user_created on public.media_assets(user_id, created_at desc);

create table if not exists public.platform_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete set null,
  amount integer not null check (amount <> 0),
  event_type text not null check (event_type in ('grant','reserve','refund','adjustment')),
  source text not null,
  idempotency_key text not null,
  balance_after integer not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists idx_platform_credit_ledger_user_created on public.platform_credit_ledger(user_id, created_at desc);

create table if not exists public.legacy_credit_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(user_id, job_id)
);

alter table public.platform_credit_accounts enable row level security;
alter table public.platform_credit_ledger enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.legacy_credit_refunds enable row level security;

drop policy if exists platform_credit_account_self_read on public.platform_credit_accounts;
create policy platform_credit_account_self_read on public.platform_credit_accounts for select using (auth.uid() = user_id or public.is_owner(auth.uid()));
drop policy if exists platform_credit_ledger_self_read on public.platform_credit_ledger;
create policy platform_credit_ledger_self_read on public.platform_credit_ledger for select using (auth.uid() = user_id or public.is_owner(auth.uid()));
drop policy if exists generation_jobs_self_read on public.generation_jobs;
create policy generation_jobs_self_read on public.generation_jobs for select using (auth.uid() = user_id or public.is_owner(auth.uid()));
drop policy if exists media_assets_self_read on public.media_assets;
create policy media_assets_self_read on public.media_assets for select using (auth.uid() = user_id or public.is_owner(auth.uid()));

-- Only service_role can mutate balances or job state; browser clients cannot grant credits.
revoke all on public.platform_credit_accounts, public.platform_credit_ledger, public.generation_jobs, public.media_assets, public.legacy_credit_refunds from anon, authenticated;
grant select on public.platform_credit_accounts, public.platform_credit_ledger, public.generation_jobs, public.media_assets to authenticated;

create or replace function public.grant_leonardx_welcome_bonus()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  inserted_rows integer := 0;
  new_balance integer;
begin
  if lower(coalesce(new.role, 'user')) = 'owner' then return new; end if;
  insert into public.platform_credit_accounts(user_id, balance, total_granted)
    values(new.id, 50, 50)
    on conflict(user_id) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows > 0 then
    select balance into new_balance from public.platform_credit_accounts where user_id = new.id;
    insert into public.platform_credit_ledger(user_id, amount, event_type, source, idempotency_key, balance_after, metadata)
      values(new.id, 50, 'grant', 'signup_welcome_bonus', 'welcome-bonus-v1', new_balance, jsonb_build_object('bonus_credits',50))
      on conflict(user_id, idempotency_key) do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.grant_leonardx_welcome_bonus() from public, anon, authenticated;
drop trigger if exists leonardx_welcome_bonus_on_profile_created on public.profiles;
create trigger leonardx_welcome_bonus_on_profile_created after insert on public.profiles
  for each row execute procedure public.grant_leonardx_welcome_bonus();

create or replace function public.reserve_platform_credits(p_user_id uuid, p_job_id uuid, p_cost integer)
returns integer language plpgsql security definer set search_path=public as $$
declare
  current_balance integer;
  remaining integer;
  existing public.platform_credit_ledger%rowtype;
begin
  if p_cost < 1 then raise exception 'Credit cost must be positive'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select * into existing from public.platform_credit_ledger
    where user_id=p_user_id and idempotency_key=('reserve:'||p_job_id::text);
  if found then return existing.balance_after; end if;
  select balance into current_balance from public.platform_credit_accounts where user_id=p_user_id for update;
  if not found or current_balance < p_cost then raise exception 'Insufficient platform credits'; end if;
  update public.platform_credit_accounts set balance=balance-p_cost,total_spent=total_spent+p_cost,updated_at=now()
    where user_id=p_user_id returning balance into remaining;
  insert into public.platform_credit_ledger(user_id,job_id,amount,event_type,source,idempotency_key,balance_after)
    values(p_user_id,p_job_id,-p_cost,'reserve','generation','reserve:'||p_job_id::text,remaining);
  return remaining;
end; $$;

create or replace function public.refund_platform_credits(p_user_id uuid, p_job_id uuid, p_cost integer)
returns integer language plpgsql security definer set search_path=public as $$
declare
  remaining integer;
  already_refunded boolean;
begin
  if p_cost < 1 then raise exception 'Refund cost must be positive'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select exists(select 1 from public.platform_credit_ledger where user_id=p_user_id and idempotency_key=('refund:'||p_job_id::text)) into already_refunded;
  if already_refunded then select balance into remaining from public.platform_credit_accounts where user_id=p_user_id; return remaining; end if;
  update public.platform_credit_accounts set balance=balance+p_cost,total_spent=greatest(0,total_spent-p_cost),updated_at=now()
    where user_id=p_user_id returning balance into remaining;
  if not found then raise exception 'Platform credit account not found'; end if;
  insert into public.platform_credit_ledger(user_id,job_id,amount,event_type,source,idempotency_key,balance_after)
    values(p_user_id,p_job_id,p_cost,'refund','generation_failure','refund:'||p_job_id::text,remaining);
  return remaining;
end; $$;

create or replace function public.refund_user_feature_credit(p_user_id uuid, p_feature text, p_job_id uuid, p_cost integer)
returns integer language plpgsql security definer set search_path=public as $$
declare
  remaining integer;
begin
  if p_cost < 1 then raise exception 'Refund cost must be positive'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if exists(select 1 from public.legacy_credit_refunds where user_id=p_user_id and job_id=p_job_id) then
    select credits_remaining into remaining from public.credits where user_id=p_user_id and feature=p_feature;
    return coalesce(remaining,0);
  end if;
  update public.credits set credits_remaining=credits_remaining+p_cost, credits_used=greatest(0,credits_used-p_cost)
    where user_id=p_user_id and feature=p_feature returning credits_remaining into remaining;
  if not found then raise exception 'Feature credit account not found'; end if;
  insert into public.legacy_credit_refunds(user_id,feature,job_id,amount) values(p_user_id,p_feature,p_job_id,p_cost);
  return remaining;
end; $$;

revoke all on function public.reserve_platform_credits(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.refund_platform_credits(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.refund_user_feature_credit(uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_platform_credits(uuid,uuid,integer) to service_role;
grant execute on function public.refund_platform_credits(uuid,uuid,integer) to service_role;
grant execute on function public.refund_user_feature_credit(uuid,text,uuid,integer) to service_role;
