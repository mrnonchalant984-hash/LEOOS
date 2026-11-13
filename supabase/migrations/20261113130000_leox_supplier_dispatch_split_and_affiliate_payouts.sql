-- Provider-backed seller split settlement, supplier dispatch state and affiliate payout ledger.
-- This migration stores provider references only; no payment credentials or customer funds are stored here.
alter table public.marketplace_seller_payout_accounts
  add column if not exists subaccount_code text unique;

alter table public.marketplace_affiliate_commissions
  drop constraint if exists marketplace_affiliate_commissions_status_check;
alter table public.marketplace_affiliate_commissions
  add constraint marketplace_affiliate_commissions_status_check
  check (status in ('pending','eligible','processing','paid','failed','rejected','reversed'));

create table if not exists public.marketplace_affiliate_payout_accounts (
  affiliate_id uuid primary key references public.marketplace_affiliates(user_id) on delete restrict,
  recipient_code text not null unique,
  bank_code text not null check (length(bank_code) between 2 and 20),
  account_name text not null check (length(account_name) between 2 and 120),
  account_last4 char(4) not null check (account_last4 ~ '^[0-9]{4}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.marketplace_affiliates(user_id) on delete restrict,
  commission_id uuid not null unique references public.marketplace_affiliate_commissions(id) on delete restrict,
  recipient_code text not null,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'initiating' check (status in ('initiating','pending','success','failed')),
  transfer_code text,
  failure_reason text check (failure_reason is null or length(failure_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_supplier_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_request_id uuid not null references public.marketplace_supplier_fulfillment_requests(id) on delete restrict,
  idempotency_key text not null unique,
  provider text not null,
  status text not null check (status in ('queued','sent','accepted','failed')),
  provider_reference text,
  response_code integer,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_affiliate_payout_accounts enable row level security;
alter table public.marketplace_affiliate_payouts enable row level security;
alter table public.marketplace_supplier_dispatch_events enable row level security;
revoke all on public.marketplace_affiliate_payout_accounts, public.marketplace_affiliate_payouts, public.marketplace_supplier_dispatch_events from public, anon, authenticated;
grant all on public.marketplace_affiliate_payout_accounts, public.marketplace_affiliate_payouts, public.marketplace_supplier_dispatch_events to service_role;

create or replace function public.claim_marketplace_affiliate_commission_payout(p_commission_id uuid, p_affiliate_id uuid, p_payout_id uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_commission public.marketplace_affiliate_commissions%rowtype; v_account public.marketplace_affiliate_payout_accounts%rowtype; v_payout public.marketplace_affiliate_payouts%rowtype;
begin
  select * into v_commission from public.marketplace_affiliate_commissions where id=p_commission_id and affiliate_id=p_affiliate_id for update;
  if not found or v_commission.status <> 'eligible' or v_commission.eligible_at is null or v_commission.eligible_at > now() or v_commission.commission_kobo <= 0 then raise exception 'commission is not payable'; end if;
  select * into v_account from public.marketplace_affiliate_payout_accounts where affiliate_id=p_affiliate_id;
  if not found then raise exception 'affiliate payout account is missing'; end if;
  insert into public.marketplace_affiliate_payouts(id,affiliate_id,commission_id,recipient_code,reference,amount_kobo,status)
    values(p_payout_id,p_affiliate_id,p_commission_id,v_account.recipient_code,p_reference,v_commission.commission_kobo,'initiating');
  update public.marketplace_affiliate_commissions set status='processing', payout_reference=p_reference, updated_at=now() where id=p_commission_id;
  select * into v_payout from public.marketplace_affiliate_payouts where id=p_payout_id;
  return to_jsonb(v_payout);
end; $$;
revoke all on function public.claim_marketplace_affiliate_commission_payout(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_marketplace_affiliate_commission_payout(uuid,uuid,uuid,text) to service_role;

create table if not exists public.marketplace_affiliate_payout_requests (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.marketplace_affiliates(user_id) on delete restrict,
  commission_id uuid not null unique references public.marketplace_affiliate_commissions(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','processing','paid','failed')),
  review_note text check (review_note is null or length(review_note) <= 1000),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_affiliate_payout_requests enable row level security;
revoke all on public.marketplace_affiliate_payout_requests from public,anon,authenticated;
grant all on public.marketplace_affiliate_payout_requests to service_role;

create or replace function public.claim_marketplace_affiliate_commission_payout(p_commission_id uuid, p_affiliate_id uuid, p_payout_id uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_commission public.marketplace_affiliate_commissions%rowtype; v_account public.marketplace_affiliate_payout_accounts%rowtype; v_payout public.marketplace_affiliate_payouts%rowtype; v_request public.marketplace_affiliate_payout_requests%rowtype;
begin
  select * into v_commission from public.marketplace_affiliate_commissions where id=p_commission_id and affiliate_id=p_affiliate_id for update;
  if not found or v_commission.status <> 'eligible' or v_commission.eligible_at is null or v_commission.eligible_at > now() or v_commission.commission_kobo <= 0 then raise exception 'commission is not payable'; end if;
  select * into v_request from public.marketplace_affiliate_payout_requests where commission_id=p_commission_id and affiliate_id=p_affiliate_id for update;
  if not found or v_request.status <> 'approved' then raise exception 'affiliate payout request is not approved'; end if;
  select * into v_account from public.marketplace_affiliate_payout_accounts where affiliate_id=p_affiliate_id;
  if not found then raise exception 'affiliate payout account is missing'; end if;
  insert into public.marketplace_affiliate_payouts(id,affiliate_id,commission_id,recipient_code,reference,amount_kobo,status)
    values(p_payout_id,p_affiliate_id,p_commission_id,v_account.recipient_code,p_reference,v_commission.commission_kobo,'initiating');
  update public.marketplace_affiliate_commissions set status='processing', payout_reference=p_reference, updated_at=now() where id=p_commission_id;
  update public.marketplace_affiliate_payout_requests set status='processing', updated_at=now() where id=v_request.id;
  select * into v_payout from public.marketplace_affiliate_payouts where id=p_payout_id;
  return to_jsonb(v_payout);
end; $$;
revoke all on function public.claim_marketplace_affiliate_commission_payout(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_marketplace_affiliate_commission_payout(uuid,uuid,uuid,text) to service_role;
alter table public.marketplace_affiliate_payouts drop constraint if exists marketplace_affiliate_payouts_status_check;
alter table public.marketplace_affiliate_payouts add constraint marketplace_affiliate_payouts_status_check
  check (status in ('initiating','pending','success','failed','reversed'));
alter table public.marketplace_affiliate_payout_requests drop constraint if exists marketplace_affiliate_payout_requests_status_check;
alter table public.marketplace_affiliate_payout_requests add constraint marketplace_affiliate_payout_requests_status_check
  check (status in ('pending','approved','rejected','processing','paid','failed','reversed'));
