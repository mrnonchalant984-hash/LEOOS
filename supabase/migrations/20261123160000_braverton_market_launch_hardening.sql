-- Braverton Market launch hardening: seller decision audit, human-readable order refs,
-- notification delivery evidence, and supplier-approved dropship applications.
create or replace function public.assign_braverton_order_number()
returns trigger language plpgsql set search_path = public as $
begin
  -- Random 80-bit suffix prevents easy reference enumeration; order access still
  -- requires the authenticated buyer or seller relationship.
  new.order_number := 'BRV-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  return new;
end;
$$;
drop trigger if exists marketplace_orders_braverton_number on public.marketplace_orders;
create trigger marketplace_orders_braverton_number
before insert on public.marketplace_orders
for each row execute function public.assign_braverton_order_number();
update public.marketplace_orders
set order_number = 'BRV-' || to_char(created_at, 'YYYY') || '-' ||
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))
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


alter table public.marketplace_dropship_applications
  add column if not exists category text not null default 'General' check(length(btrim(category)) between 1 and 80),
  add column if not exists country_code char(2) not null default 'NG' check(country_code ~ '^[A-Z]{2}$'),
  add column if not exists region text check(region is null or length(region) <= 100),
  add column if not exists city text not null default 'Not specified' check(length(btrim(city)) between 1 and 100),
  add column if not exists currency char(3) not null default 'NGN' check(currency ~ '^[A-Z]{3}$');

create or replace function public.review_marketplace_dropship_application(
  p_application_id uuid, p_supplier_id uuid, p_decision text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_app public.marketplace_dropship_applications%rowtype;
  v_supplier_product public.marketplace_supplier_products%rowtype;
  v_supplier public.marketplace_suppliers%rowtype;
  v_seller public.marketplace_sellers%rowtype;
  v_product public.marketplace_products%rowtype;
  v_listing public.marketplace_dropship_listings%rowtype;
begin
  if p_decision not in ('approved','rejected') or length(coalesce(p_note,'')) > 1000 then
    raise exception 'invalid dropship application decision';
  end if;
  select * into v_app from public.marketplace_dropship_applications
    where id=p_application_id and supplier_id=p_supplier_id for update;
  if not found then raise exception 'dropship application not found'; end if;
  if v_app.supplier_status <> 'pending' then
    return jsonb_build_object('processed',false,'status',v_app.supplier_status);
  end if;
  select * into v_supplier from public.marketplace_suppliers where user_id=p_supplier_id;
  if not found or v_supplier.verification_status <> 'approved' then raise exception 'supplier is not approved'; end if;
  if p_decision='rejected' then
    update public.marketplace_dropship_applications set supplier_status='rejected',
      supplier_note=nullif(p_note,''),reviewed_by=p_supplier_id,reviewed_at=now(),updated_at=now()
      where id=v_app.id;
    return jsonb_build_object('processed',true,'status','rejected');
  end if;
  select * into v_seller from public.marketplace_sellers where user_id=v_app.seller_id;
  if not found or not v_seller.is_verified then raise exception 'reseller is not verified'; end if;
  select * into v_supplier_product from public.marketplace_supplier_products
    where id=v_app.supplier_product_id and supplier_id=p_supplier_id for update;
  if not found or v_supplier_product.status <> 'active' or v_supplier_product.available_quantity <= 0 then
    raise exception 'supplier product is unavailable';
  end if;
  if v_app.currency <> v_supplier_product.currency then raise exception 'reseller application currency does not match supplier currency'; end if;
  if v_app.proposed_selling_price_kobo <= v_supplier_product.cost_kobo then
    raise exception 'reseller price must exceed supplier cost';
  end if;
  insert into public.marketplace_products(
    seller_id,slug,title,description,category,price,currency,condition,country_code,region,city,
    status,image_urls,image_paths,stock_quantity,reserved_quantity
  ) values (
    v_app.seller_id,
    'dropship-' || replace(gen_random_uuid()::text,'-',''),
    left(v_supplier_product.title,120),
    left(coalesce(nullif(v_supplier_product.description,''),v_supplier_product.title),5000),
    v_app.category,v_app.proposed_selling_price_kobo::numeric / 100,v_app.currency,'new',
    v_app.country_code,v_app.region,v_app.city,'pending_review','{}','{}',
    v_supplier_product.available_quantity,0
  ) returning * into v_product;
  insert into public.marketplace_dropship_listings(
    seller_id,supplier_product_id,marketplace_product_id,selling_price_kobo,status
  ) values(v_app.seller_id,v_app.supplier_product_id,v_product.id,v_app.proposed_selling_price_kobo,'paused')
  returning * into v_listing;
  update public.marketplace_dropship_applications set supplier_status='approved',
    supplier_note=nullif(p_note,''),reviewed_by=p_supplier_id,reviewed_at=now(),
    supplier_terms_version='braverton-supplier-dropship-v1',supplier_agreed_at=now(),
    marketplace_product_id=v_product.id,dropship_listing_id=v_listing.id,updated_at=now()
    where id=v_app.id;
  return jsonb_build_object('processed',true,'status','approved',
    'marketplace_product_id',v_product.id,'listing_id',v_listing.id,
    'listing_moderation_status',v_product.status);
end;
$$;
revoke all on function public.review_marketplace_dropship_application(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_marketplace_dropship_application(uuid,uuid,text,text) to service_role;

create or replace function public.record_marketplace_fulfillment_timeline()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.marketplace_order_events(order_id,actor_id,event_type,details)
    values(new.order_id,new.seller_id,'fulfillment_status_changed',
      jsonb_build_object('seller_id',new.seller_id,'status',new.status,'method',new.method,
        'tracking_reference',new.tracking_reference,'courier_name',new.courier_name));
  end if;
  if new.buyer_confirmed_at is not null and (tg_op = 'INSERT' or old.buyer_confirmed_at is distinct from new.buyer_confirmed_at) then
    insert into public.marketplace_order_events(order_id,event_type,details)
    values(new.order_id,'buyer_delivery_confirmed',jsonb_build_object('seller_id',new.seller_id));
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_fulfillment_timeline on public.marketplace_fulfillments;
create trigger marketplace_fulfillment_timeline
after insert or update of status,buyer_confirmed_at on public.marketplace_fulfillments
for each row execute function public.record_marketplace_fulfillment_timeline();
revoke all on function public.record_marketplace_fulfillment_timeline() from public,anon,authenticated;

alter table public.marketplace_seller_verification_decisions
  drop constraint if exists marketplace_seller_verification_decisions_outcome_check;
alter table public.marketplace_seller_verification_decisions
  add constraint marketplace_seller_verification_decisions_outcome_check
  check(outcome in ('auto_approved','manual_review','rejected','owner_approved','owner_rejected'));

create or replace function public.owner_review_marketplace_seller_verification(
  p_request_id uuid, p_reviewer_id uuid, p_decision text, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.marketplace_seller_verification_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_outcome text;
begin
  if p_decision not in ('approved','rejected') or length(btrim(coalesce(p_note,''))) < 3 or length(p_note) > 2000 then
    raise exception 'valid owner decision and review note are required';
  end if;
  select * into v_profile from public.profiles where id=p_reviewer_id and role='owner' and twofa_verified=true;
  if not found then raise exception 'owner authorization and verified two-factor authentication required'; end if;
  select * into v_request from public.marketplace_seller_verification_requests where id=p_request_id for update;
  if not found then raise exception 'verification request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'verification request is no longer pending'; end if;
  v_outcome := case when p_decision='approved' then 'owner_approved' else 'owner_rejected' end;
  if p_decision='approved' then
    insert into public.marketplace_sellers(user_id,display_name,bio,country_code,is_verified,updated_at)
    values(v_request.seller_id,v_request.business_name,v_request.details,v_request.country_code,true,now())
    on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,
      country_code=excluded.country_code,is_verified=true,updated_at=now();
  else
    update public.marketplace_sellers set is_verified=false,updated_at=now()
      where user_id=v_request.seller_id;
  end if;
  update public.marketplace_seller_verification_requests
    set status=p_decision,reviewer_id=p_reviewer_id,reviewer_note=p_note,updated_at=now()
    where id=v_request.id;
  insert into public.marketplace_seller_verification_decisions(
    request_id,seller_id,decision_source,outcome,risk_score,risk_signals,rationale,engine_version,reviewer_id
  ) values(v_request.id,v_request.seller_id,'owner',v_outcome,
    case when p_decision='approved' then 0 else 100 end,'[]'::jsonb,p_note,
    'owner-manual-' || gen_random_uuid()::text,p_reviewer_id);
  return jsonb_build_object('request_id',v_request.id,'status',p_decision,'seller_id',v_request.seller_id);
end;
$$;
revoke all on function public.owner_review_marketplace_seller_verification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.owner_review_marketplace_seller_verification(uuid,uuid,text,text) to service_role;

alter table public.marketplace_notifications
  add column if not exists preference_key text not null default 'order_updates'
  check(preference_key in ('messages','order_updates','support_updates'));

alter table public.marketplace_seller_verification_requests
  add column if not exists evidence_url text,
  add column if not exists evidence_notes text;
alter table public.marketplace_seller_verification_requests
  drop constraint if exists marketplace_seller_verification_evidence_url_check;
alter table public.marketplace_seller_verification_requests
  add constraint marketplace_seller_verification_evidence_url_check
  check(evidence_url is null or (length(evidence_url) <= 500 and evidence_url ~ '^https://'));
alter table public.marketplace_seller_verification_requests
  drop constraint if exists marketplace_seller_verification_evidence_notes_check;
alter table public.marketplace_seller_verification_requests
  add constraint marketplace_seller_verification_evidence_notes_check
  check(evidence_notes is null or length(evidence_notes) <= 1000);

create or replace function public.sync_braverton_dropship_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.marketplace_dropship_listings l
     set status = case
       when new.status = 'active' and sp.status = 'active' and sp.available_quantity > 0 and s.verification_status = 'approved' then 'active'
       when sp.status <> 'active' or sp.available_quantity <= 0 or s.verification_status <> 'approved' then 'supplier_unavailable'
       else 'paused'
     end,
     updated_at = now()
    from public.marketplace_supplier_products sp
    join public.marketplace_suppliers s on s.user_id=sp.supplier_id
   where l.marketplace_product_id=new.id and l.supplier_product_id=sp.id and l.status <> 'removed';
  return new;
end;
$$;
drop trigger if exists marketplace_product_dropship_moderation on public.marketplace_products;
create trigger marketplace_product_dropship_moderation
after update of status on public.marketplace_products
for each row when (old.status is distinct from new.status)
execute function public.sync_braverton_dropship_listing_moderation();
revoke all on function public.sync_braverton_dropship_listing_moderation() from public,anon,authenticated;

create or replace function public.sync_braverton_supplier_verification_to_listings()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.marketplace_dropship_listings l
     set status = case
       when new.verification_status='approved' and sp.status='active' and sp.available_quantity > 0 and p.status='active' then 'active'
       else 'supplier_unavailable'
     end,
     updated_at=now()
    from public.marketplace_supplier_products sp
    join public.marketplace_products p on p.id=l.marketplace_product_id
   where sp.supplier_id=new.user_id and l.supplier_product_id=sp.id and l.status <> 'removed';
  return new;
end;
$$;
drop trigger if exists marketplace_supplier_verification_listing_sync on public.marketplace_suppliers;
create trigger marketplace_supplier_verification_listing_sync
after update of verification_status on public.marketplace_suppliers
for each row when (old.verification_status is distinct from new.verification_status)
execute function public.sync_braverton_supplier_verification_to_listings();
revoke all on function public.sync_braverton_supplier_verification_to_listings() from public,anon,authenticated;

create or replace function public.review_marketplace_dropship_application(
  p_application_id uuid, p_supplier_id uuid, p_decision text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_app public.marketplace_dropship_applications%rowtype;
  v_supplier_product public.marketplace_supplier_products%rowtype;
  v_supplier public.marketplace_suppliers%rowtype;
  v_seller public.marketplace_sellers%rowtype;
  v_product public.marketplace_products%rowtype;
  v_listing public.marketplace_dropship_listings%rowtype;
begin
  if p_decision not in ('approved','rejected') or length(coalesce(p_note,'')) > 1000 then
    raise exception 'invalid dropship application decision';
  end if;
  select * into v_app from public.marketplace_dropship_applications
    where id=p_application_id and supplier_id=p_supplier_id for update;
  if not found then raise exception 'dropship application not found'; end if;
  if v_app.supplier_status <> 'pending' then
    return jsonb_build_object('processed',false,'status',v_app.supplier_status);
  end if;
  select * into v_supplier from public.marketplace_suppliers where user_id=p_supplier_id;
  if not found or v_supplier.verification_status <> 'approved' then raise exception 'supplier is not approved'; end if;
  if p_decision='rejected' then
    update public.marketplace_dropship_applications set supplier_status='rejected',
      supplier_note=nullif(p_note,''),reviewed_by=p_supplier_id,reviewed_at=now(),updated_at=now()
      where id=v_app.id;
    return jsonb_build_object('processed',true,'status','rejected');
  end if;
  select * into v_seller from public.marketplace_sellers where user_id=v_app.seller_id;
  if not found or not v_seller.is_verified then raise exception 'reseller is not verified'; end if;
  select * into v_supplier_product from public.marketplace_supplier_products
    where id=v_app.supplier_product_id and supplier_id=p_supplier_id for update;
  if not found or v_supplier_product.status <> 'active' or v_supplier_product.available_quantity <= 0 then
    raise exception 'supplier product is unavailable';
  end if;
  if v_app.proposed_selling_price_kobo <= v_supplier_product.cost_kobo then
    raise exception 'reseller price must exceed supplier cost';
  end if;
  insert into public.marketplace_products(
    seller_id,slug,title,description,category,price,currency,condition,country_code,region,city,
    status,image_urls,image_paths,stock_quantity,reserved_quantity
  ) values (
    v_app.seller_id,
    'dropship-' || replace(gen_random_uuid()::text,'-',''),
    left(v_supplier_product.title,120),
    left(coalesce(nullif(v_supplier_product.description,''),v_supplier_product.title),5000),
    v_app.category,v_app.proposed_selling_price_kobo::numeric / 100,v_supplier_product.currency,'new',
    v_app.country_code,v_app.region,v_app.city,'pending_review','{}','{}',
    v_supplier_product.available_quantity,0
  ) returning * into v_product;
  insert into public.marketplace_dropship_listings(
    seller_id,supplier_product_id,marketplace_product_id,selling_price_kobo,status
  ) values(v_app.seller_id,v_app.supplier_product_id,v_product.id,v_app.proposed_selling_price_kobo,'paused')
  returning * into v_listing;
  update public.marketplace_dropship_applications set supplier_status='approved',
    supplier_note=nullif(p_note,''),reviewed_by=p_supplier_id,reviewed_at=now(),
    marketplace_product_id=v_product.id,dropship_listing_id=v_listing.id,updated_at=now()
    where id=v_app.id;
  return jsonb_build_object('processed',true,'status','approved',
    'marketplace_product_id',v_product.id,'listing_id',v_listing.id,
    'listing_moderation_status',v_product.status);
end;
$$;
revoke all on function public.review_marketplace_dropship_application(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_marketplace_dropship_application(uuid,uuid,text,text) to service_role;

create or replace function public.record_marketplace_fulfillment_timeline()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.marketplace_order_events(order_id,actor_id,event_type,details)
    values(new.order_id,new.seller_id,'fulfillment_status_changed',
      jsonb_build_object('seller_id',new.seller_id,'status',new.status,'method',new.method,
        'tracking_reference',new.tracking_reference,'courier_name',new.courier_name));
  end if;
  if new.buyer_confirmed_at is not null and (tg_op = 'INSERT' or old.buyer_confirmed_at is distinct from new.buyer_confirmed_at) then
    insert into public.marketplace_order_events(order_id,event_type,details)
    values(new.order_id,'buyer_delivery_confirmed',jsonb_build_object('seller_id',new.seller_id));
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_fulfillment_timeline on public.marketplace_fulfillments;
create trigger marketplace_fulfillment_timeline
after insert or update of status,buyer_confirmed_at on public.marketplace_fulfillments
for each row execute function public.record_marketplace_fulfillment_timeline();
revoke all on function public.record_marketplace_fulfillment_timeline() from public,anon,authenticated;

alter table public.marketplace_seller_verification_decisions
  drop constraint if exists marketplace_seller_verification_decisions_outcome_check;
alter table public.marketplace_seller_verification_decisions
  add constraint marketplace_seller_verification_decisions_outcome_check
  check(outcome in ('auto_approved','manual_review','rejected','owner_approved','owner_rejected'));

create or replace function public.owner_review_marketplace_seller_verification(
  p_request_id uuid, p_reviewer_id uuid, p_decision text, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.marketplace_seller_verification_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_outcome text;
begin
  if p_decision not in ('approved','rejected') or length(btrim(coalesce(p_note,''))) < 3 or length(p_note) > 2000 then
    raise exception 'valid owner decision and review note are required';
  end if;
  select * into v_profile from public.profiles where id=p_reviewer_id and role='owner' and twofa_verified=true;
  if not found then raise exception 'owner authorization and verified two-factor authentication required'; end if;
  select * into v_request from public.marketplace_seller_verification_requests where id=p_request_id for update;
  if not found then raise exception 'verification request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'verification request is no longer pending'; end if;
  v_outcome := case when p_decision='approved' then 'owner_approved' else 'owner_rejected' end;
  if p_decision='approved' then
    insert into public.marketplace_sellers(user_id,display_name,bio,country_code,is_verified,updated_at)
    values(v_request.seller_id,v_request.business_name,v_request.details,v_request.country_code,true,now())
    on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,
      country_code=excluded.country_code,is_verified=true,updated_at=now();
  else
    update public.marketplace_sellers set is_verified=false,updated_at=now()
      where user_id=v_request.seller_id;
  end if;
  update public.marketplace_seller_verification_requests
    set status=p_decision,reviewer_id=p_reviewer_id,reviewer_note=p_note,updated_at=now()
    where id=v_request.id;
  insert into public.marketplace_seller_verification_decisions(
    request_id,seller_id,decision_source,outcome,risk_score,risk_signals,rationale,engine_version,reviewer_id
  ) values(v_request.id,v_request.seller_id,'owner',v_outcome,
    case when p_decision='approved' then 0 else 100 end,'[]'::jsonb,p_note,
    'owner-manual-' || gen_random_uuid()::text,p_reviewer_id);
  return jsonb_build_object('request_id',v_request.id,'status',p_decision,'seller_id',v_request.seller_id);
end;
$$;
revoke all on function public.owner_review_marketplace_seller_verification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.owner_review_marketplace_seller_verification(uuid,uuid,text,text) to service_role;

revoke all on function public.assign_braverton_order_number() from public,anon,authenticated;

alter table public.marketplace_notifications
  add column if not exists preference_key text not null default 'order_updates'
  check(preference_key in ('messages','order_updates','support_updates'));

alter table public.marketplace_seller_verification_requests
  add column if not exists evidence_url text,
  add column if not exists evidence_notes text;
alter table public.marketplace_seller_verification_requests
  drop constraint if exists marketplace_seller_verification_evidence_url_check;
alter table public.marketplace_seller_verification_requests
  add constraint marketplace_seller_verification_evidence_url_check
  check(evidence_url is null or (length(evidence_url) <= 500 and evidence_url ~ '^https://'));
alter table public.marketplace_seller_verification_requests
  drop constraint if exists marketplace_seller_verification_evidence_notes_check;
alter table public.marketplace_seller_verification_requests
  add constraint marketplace_seller_verification_evidence_notes_check
  check(evidence_notes is null or length(evidence_notes) <= 1000);

create or replace function public.sync_braverton_dropship_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.marketplace_dropship_listings l
     set status = case
       when new.status = 'active' and sp.status = 'active' and sp.available_quantity > 0 and s.verification_status = 'approved' then 'active'
       when sp.status <> 'active' or sp.available_quantity <= 0 or s.verification_status <> 'approved' then 'supplier_unavailable'
       else 'paused'
     end,
     updated_at = now()
    from public.marketplace_supplier_products sp
    join public.marketplace_suppliers s on s.user_id=sp.supplier_id
   where l.marketplace_product_id=new.id and l.supplier_product_id=sp.id and l.status <> 'removed';
  return new;
end;
$$;
drop trigger if exists marketplace_product_dropship_moderation on public.marketplace_products;
create trigger marketplace_product_dropship_moderation
after update of status on public.marketplace_products
for each row when (old.status is distinct from new.status)
execute function public.sync_braverton_dropship_listing_moderation();
revoke all on function public.sync_braverton_dropship_listing_moderation() from public,anon,authenticated;

create or replace function public.sync_braverton_supplier_verification_to_listings()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.marketplace_dropship_listings l
     set status = case
       when new.verification_status='approved' and sp.status='active' and sp.available_quantity > 0 and p.status='active' then 'active'
       else 'supplier_unavailable'
     end,
     updated_at=now()
    from public.marketplace_supplier_products sp
    join public.marketplace_products p on p.id=l.marketplace_product_id
   where sp.supplier_id=new.user_id and l.supplier_product_id=sp.id and l.status <> 'removed';
  return new;
end;
$$;
drop trigger if exists marketplace_supplier_verification_listing_sync on public.marketplace_suppliers;
create trigger marketplace_supplier_verification_listing_sync
after update of verification_status on public.marketplace_suppliers
for each row when (old.verification_status is distinct from new.verification_status)
execute function public.sync_braverton_supplier_verification_to_listings();
revoke all on function public.sync_braverton_supplier_verification_to_listings() from public,anon,authenticated;

create table if not exists public.marketplace_dropship_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.marketplace_dropship_applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check(actor_type in ('seller','supplier','system')),
  event_type text not null check(length(event_type) between 3 and 60),
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_dropship_application_events_timeline_idx
  on public.marketplace_dropship_application_events(application_id,created_at asc);
alter table public.marketplace_dropship_application_events enable row level security;
revoke all on public.marketplace_dropship_application_events from public,anon,authenticated;
grant all on public.marketplace_dropship_application_events to service_role;

create or replace function public.record_braverton_dropship_application_event()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op='INSERT' then
    insert into public.marketplace_dropship_application_events(application_id,actor_id,actor_type,event_type,details)
    values(new.id,new.seller_id,'seller','application_submitted',
      jsonb_build_object('supplier_product_id',new.supplier_product_id,'proposed_selling_price_kobo',new.proposed_selling_price_kobo,
        'currency',new.currency,'terms_version',new.terms_version,'seller_agreed_at',new.seller_agreed_at));
  elsif old.supplier_status is distinct from new.supplier_status then
    insert into public.marketplace_dropship_application_events(application_id,actor_id,actor_type,event_type,details)
    values(new.id,new.reviewed_by,'supplier','supplier_' || new.supplier_status,
      jsonb_build_object('supplier_status',new.supplier_status,'supplier_note',new.supplier_note,
        'marketplace_product_id',new.marketplace_product_id,'dropship_listing_id',new.dropship_listing_id,
        'supplier_terms_version',new.supplier_terms_version,'supplier_agreed_at',new.supplier_agreed_at));
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_dropship_application_event_log on public.marketplace_dropship_applications;
create trigger marketplace_dropship_application_event_log
after insert or update of supplier_status on public.marketplace_dropship_applications
for each row execute function public.record_braverton_dropship_application_event();

create or replace function public.record_braverton_dropship_listing_event()
returns trigger language plpgsql set search_path = public as $$
declare v_application_id uuid;
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    select id into v_application_id from public.marketplace_dropship_applications
      where dropship_listing_id=new.id limit 1;
    if v_application_id is not null then
      insert into public.marketplace_dropship_application_events(application_id,actor_type,event_type,details)
      values(v_application_id,'system','listing_status_changed',
        jsonb_build_object('listing_status',new.status,'marketplace_product_id',new.marketplace_product_id));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_dropship_listing_event_log on public.marketplace_dropship_listings;
create trigger marketplace_dropship_listing_event_log
after insert or update of status on public.marketplace_dropship_listings
for each row execute function public.record_braverton_dropship_listing_event();
revoke all on function public.record_braverton_dropship_application_event() from public,anon,authenticated;
revoke all on function public.record_braverton_dropship_listing_event() from public,anon,authenticated;
