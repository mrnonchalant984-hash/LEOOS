-- API billing gate and request-credit ledger. Apply through the normal migration workflow.

alter table public.api_plan_subscriptions drop constraint if exists api_plan_subscriptions_currency_check;
alter table public.api_plan_subscriptions add constraint api_plan_subscriptions_currency_check check (currency in ('NGN','USD'));
alter table public.api_plan_subscriptions drop constraint if exists api_plan_subscriptions_plan_key_check;
alter table public.api_plan_subscriptions add constraint api_plan_subscriptions_plan_key_check check (plan_key in ('developer','builder','launch','growth','scale','business_starter','business_pro','business_scale','enterprise'));
alter table public.api_plan_subscriptions add column if not exists included_credits integer not null default 0 check (included_credits >= 0);
alter table public.api_plan_subscriptions add column if not exists credits_remaining integer not null default 0 check (credits_remaining >= 0);

create table if not exists public.api_plan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  plan_key text not null check (plan_key in ('builder','growth','scale','business_starter','business_pro','business_scale')),
  currency text not null check (currency in ('NGN','USD')),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists api_plan_payments_user_created_idx on public.api_plan_payments(user_id, created_at desc);
alter table public.api_plan_payments enable row level security;
revoke all on table public.api_plan_payments from public, anon, authenticated;
grant select, insert, update on table public.api_plan_payments to service_role;

create table if not exists public.api_credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.api_plan_subscriptions(id) on delete cascade,
  usage_id uuid not null unique,
  credits integer not null check (credits > 0),
  status text not null default 'consumed' check (status in ('consumed','refunded')),
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index if not exists api_credit_events_user_created_idx on public.api_credit_events(user_id, created_at desc);
alter table public.api_credit_events enable row level security;
revoke all on table public.api_credit_events from public, anon, authenticated;
grant select, insert, update on table public.api_credit_events to service_role;

-- Payment activation is atomic and only consumes a payment already registered by the server.
create or replace function public.activate_api_plan_payment(p_reference text, p_provider_transaction_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.api_plan_payments%rowtype; s public.api_plan_subscriptions%rowtype; allowance integer;
begin
  select * into p from public.api_plan_payments where reference = p_reference for update;
  if not found then raise exception 'API plan payment not found'; end if;
  if p.status = 'succeeded' then
    select * into s from public.api_plan_subscriptions where provider_reference = p_reference order by created_at desc limit 1;
    return jsonb_build_object('already_applied', true, 'subscription_id', s.id, 'credits_remaining', s.credits_remaining);
  end if;
  if p.status <> 'pending' then raise exception 'API plan payment is not pending'; end if;
  select case p.plan_key
    when 'builder' then 2000 when 'growth' then 10000 when 'scale' then 40000
    when 'business_starter' then 5000 when 'business_pro' then 25000 when 'business_scale' then 100000
    else 0 end into allowance;
  if allowance <= 0 then raise exception 'Invalid API plan allowance'; end if;
  update public.api_plan_subscriptions set status='expired', updated_at=now()
    where user_id=p.user_id and status='active';
  insert into public.api_plan_subscriptions(user_id,plan_key,status,currency,monthly_amount_minor,provider_reference,current_period_start,current_period_end,included_credits,credits_remaining,metadata)
    values (p.user_id,p.plan_key,'active',p.currency,p.amount_minor,p.reference,now(),now()+interval '30 days',allowance,allowance,jsonb_build_object('billing_mode','manual_monthly','provider_transaction_id',p_provider_transaction_id))
    returning * into s;
  update public.api_plan_payments set status='succeeded',provider_transaction_id=p_provider_transaction_id,verified_at=now() where id=p.id;
  return jsonb_build_object('already_applied',false,'subscription_id',s.id,'credits_remaining',s.credits_remaining);
end;
$$;
revoke all on function public.activate_api_plan_payment(text,text) from public, anon, authenticated;
grant execute on function public.activate_api_plan_payment(text,text) to service_role;

-- Atomic request-credit debit. A unique usage_id prevents duplicate debits for one server request.
create or replace function public.consume_api_request_credit(p_user_id uuid, p_usage_id uuid, p_credits integer default 1)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.api_plan_subscriptions%rowtype;
begin
  if p_credits < 1 or p_credits > 100 then raise exception 'Invalid credit amount'; end if;
  select * into s from public.api_plan_subscriptions
    where user_id=p_user_id and status='active' and current_period_end > now() and credits_remaining >= p_credits
    order by current_period_end desc, created_at desc limit 1 for update;
  if not found then return false; end if;
  update public.api_plan_subscriptions set credits_remaining=credits_remaining-p_credits, updated_at=now() where id=s.id;
  insert into public.api_credit_events(user_id,subscription_id,usage_id,credits,status) values (p_user_id,s.id,p_usage_id,p_credits,'consumed');
  return true;
exception when unique_violation then
  return true;
end;
$$;
revoke all on function public.consume_api_request_credit(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.consume_api_request_credit(uuid,uuid,integer) to service_role;

create or replace function public.refund_api_request_credit(p_usage_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.api_credit_events%rowtype;
begin
  select * into e from public.api_credit_events where usage_id=p_usage_id for update;
  if not found or e.status <> 'consumed' then return false; end if;
  update public.api_plan_subscriptions set credits_remaining=credits_remaining+e.credits, updated_at=now() where id=e.subscription_id;
  update public.api_credit_events set status='refunded',refunded_at=now() where id=e.id;
  return true;
end;
$$;
revoke all on function public.refund_api_request_credit(uuid) from public, anon, authenticated;
grant execute on function public.refund_api_request_credit(uuid) to service_role;
