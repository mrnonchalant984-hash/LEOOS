-- Braverton Market launch hardening: seller decision audit, human-readable order refs,
-- notification delivery evidence, and supplier-approved dropship applications.
create sequence if not exists public.marketplace_order_number_seq;

create or replace function public.assign_braverton_order_number()
returns trigger language plpgsql set search_path = public as $$
begin
  new.order_number := 'BRV-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-' ||
    lpad(nextval('public.marketplace_order_number_seq')::text, 6, '0');
  return new;
end;
$$;
drop trigger if exists marketplace_orders_braverton_number on public.marketplace_orders;
create trigger marketplace_orders_braverton_number
before insert on public.marketplace_orders
for each row execute function public.assign_braverton_order_number();
update public.marketplace_orders
set order_number = 'BRV-' || to_char(created_at, 'YYYY') || '-' ||
  lpad(nextval('public.marketplace_order_number_seq')::text, 6, '0')
where order_number like 'LX-%';

create table if not exists public.marketplace_seller_verification_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_seller_verification_requests(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  decision_source text not null check (decision_source in ('bram_rules','owner')),
  outcome text not null check (outcome in ('auto_approved','manual_review','rejected')),
  risk_score integer not null check (risk_score between 0 and 100),
  risk_signals jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_signals) = 'array'),
  rationale text not null check (length(rationale) between 1 and 2000),
  engine_version text not null check (length(engine_version) between 1 and 80),
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(request_id, engine_version)
);
create index if not exists marketplace_seller_verification_decisions_seller_idx
  on public.marketplace_seller_verification_decisions(seller_id, created_at desc);
alter table public.marketplace_seller_verification_decisions enable row level security;
revoke all on public.marketplace_seller_verification_decisions from public, anon, authenticated;
grant all on public.marketplace_seller_verification_decisions to service_role;

create or replace function public.finalize_marketplace_seller_verification(
  p_request_id uuid, p_outcome text, p_risk_score integer, p_risk_signals jsonb,
  p_rationale text, p_engine_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_request public.marketplace_seller_verification_requests%rowtype;
begin
  if p_outcome not in ('auto_approved','manual_review') or p_risk_score < 0 or p_risk_score > 100
    or jsonb_typeof(p_risk_signals) <> 'array' or length(p_rationale) not between 1 and 2000 then
    raise exception 'invalid seller verification decision';
  end if;
  select * into v_request from public.marketplace_seller_verification_requests
    where id = p_request_id for update;
  if not found then raise exception 'verification request not found'; end if;
  if v_request.status <> 'pending' then
    return jsonb_build_object('processed', false, 'status', v_request.status);
  end if;
  insert into public.marketplace_seller_verification_decisions(
    request_id,seller_id,decision_source,outcome,risk_score,risk_signals,rationale,engine_version
  ) values (v_request.id,v_request.seller_id,'bram_rules',p_outcome,p_risk_score,p_risk_signals,p_rationale,p_engine_version)
  on conflict (request_id,engine_version) do nothing;
  if p_outcome = 'auto_approved' then
    insert into public.marketplace_sellers(user_id,display_name,bio,country_code,is_verified,updated_at)
    values(v_request.seller_id,v_request.business_name,v_request.details,v_request.country_code,true,now())
    on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,
      country_code=excluded.country_code,is_verified=true,updated_at=now();
    update public.marketplace_seller_verification_requests
      set status='approved', reviewer_note=p_rationale, updated_at=now()
      where id=v_request.id and status='pending';
  else
    update public.marketplace_seller_verification_requests
      set reviewer_note=p_rationale, updated_at=now()
      where id=v_request.id and status='pending';
  end if;
  return jsonb_build_object('processed',true,'outcome',p_outcome,'request_id',v_request.id);
end;
$$;
revoke all on function public.finalize_marketplace_seller_verification(uuid,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finalize_marketplace_seller_verification(uuid,text,integer,jsonb,text,text) to service_role;

alter table public.marketplace_notifications add column if not exists dedupe_key text;
create unique index if not exists marketplace_notifications_dedupe_idx
  on public.marketplace_notifications(user_id,dedupe_key) where dedupe_key is not null;

create table if not exists public.marketplace_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.marketplace_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check(channel in ('in_app','email','push')),
  delivery_key text not null,
  status text not null default 'pending' check(status in ('pending','sent','failed','skipped')),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  provider_message_id text,
  error_code text,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(notification_id,delivery_key)
);
create index if not exists marketplace_notification_deliveries_retry_idx
  on public.marketplace_notification_deliveries(status,updated_at) where status in ('pending','failed');
alter table public.marketplace_notification_deliveries enable row level security;
revoke all on public.marketplace_notification_deliveries from public,anon,authenticated;
grant all on public.marketplace_notification_deliveries to service_role;

create table if not exists public.marketplace_dropship_applications (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.marketplace_supplier_products(id) on delete restrict,
  supplier_id uuid not null references public.marketplace_suppliers(user_id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  proposed_selling_price_kobo bigint not null check(proposed_selling_price_kobo > 0),
  terms_version text not null check(length(terms_version) between 1 and 40),
  seller_agreed_at timestamptz not null,
  supplier_status text not null default 'pending' check(supplier_status in ('pending','approved','rejected','revoked')),
  supplier_note text check(supplier_note is null or length(supplier_note) <= 1000),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  marketplace_product_id uuid references public.marketplace_products(id) on delete set null,
  dropship_listing_id uuid references public.marketplace_dropship_listings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_product_id,seller_id)
);
create index if not exists marketplace_dropship_applications_supplier_idx
  on public.marketplace_dropship_applications(supplier_id,supplier_status,created_at desc);
alter table public.marketplace_dropship_applications enable row level security;
revoke all on public.marketplace_dropship_applications from public,anon,authenticated;
grant all on public.marketplace_dropship_applications to service_role;

