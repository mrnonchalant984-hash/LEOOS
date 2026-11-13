-- Additive affiliate, supplier and dropshipping foundations.
-- All writes are service-role only until the corresponding verified API workflows ship.
-- No customer funds are held by LeonardX; affiliate commissions are accounting records only.

create table if not exists public.marketplace_affiliates (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{8,20}$'),
  status text not null default 'pending' check (status in ('pending','approved','suspended','rejected')),
  commission_bps integer not null default 500 check (commission_bps between 0 and 3000),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.marketplace_affiliates(user_id) on delete restrict,
  visitor_hash char(64) not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  product_id uuid references public.marketplace_products(id) on delete set null,
  clicked_at timestamptz not null default now()
);
create index if not exists marketplace_affiliate_clicks_lookup_idx
  on public.marketplace_affiliate_clicks(affiliate_id, clicked_at desc);

create table if not exists public.marketplace_order_attributions (
  order_id uuid primary key references public.marketplace_orders(id) on delete restrict,
  affiliate_id uuid not null references public.marketplace_affiliates(user_id) on delete restrict,
  click_id uuid not null references public.marketplace_affiliate_clicks(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  attributed_at timestamptz not null default now(),
  attribution_status text not null default 'pending' check (attribution_status in ('pending','eligible','rejected','reversed')),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 300),
  check (affiliate_id <> buyer_id)
);

create table if not exists public.marketplace_affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  affiliate_id uuid not null references public.marketplace_affiliates(user_id) on delete restrict,
  basis_kobo bigint not null check (basis_kobo > 0),
  commission_bps integer not null check (commission_bps between 0 and 3000),
  commission_kobo bigint not null check (commission_kobo >= 0),
  status text not null default 'pending' check (status in ('pending','eligible','paid','rejected','reversed')),
  eligible_at timestamptz,
  paid_at timestamptz,
  payout_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (commission_kobo = round(basis_kobo * commission_bps / 10000.0)::bigint)
);
create index if not exists marketplace_affiliate_commissions_owner_idx
  on public.marketplace_affiliate_commissions(affiliate_id, status, created_at desc);

create table if not exists public.marketplace_suppliers (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  business_name text not null check (length(btrim(business_name)) between 2 and 140),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected','suspended')),
  verification_note text check (verification_note is null or length(verification_note) <= 2000),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.marketplace_suppliers(user_id) on delete restrict,
  supplier_sku text not null check (length(btrim(supplier_sku)) between 1 and 100),
  title text not null check (length(btrim(title)) between 2 and 180),
  description text not null default '' check (length(description) <= 10000),
  cost_kobo bigint not null check (cost_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  available_quantity integer not null default 0 check (available_quantity >= 0),
  status text not null default 'draft' check (status in ('draft','active','paused','discontinued')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, supplier_sku),
  unique (id, supplier_id)
);
create index if not exists marketplace_supplier_products_catalogue_idx
  on public.marketplace_supplier_products(supplier_id, status, updated_at desc);

create table if not exists public.marketplace_dropship_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  supplier_product_id uuid not null references public.marketplace_supplier_products(id) on delete restrict,
  marketplace_product_id uuid not null unique references public.marketplace_products(id) on delete restrict,
  selling_price_kobo bigint not null check (selling_price_kobo > 0),
  status text not null default 'paused' check (status in ('active','paused','supplier_unavailable','removed')),
  last_stock_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, supplier_product_id)
);

create table if not exists public.marketplace_supplier_fulfillment_requests (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.marketplace_order_items(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  supplier_id uuid not null references public.marketplace_suppliers(user_id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  supplier_product_id uuid not null references public.marketplace_supplier_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'requested' check (status in ('requested','accepted','rejected','processing','shipped','delivered','cancelled','failed')),
  supplier_reference text,
  tracking_reference text,
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_supplier_fulfillment_supplier_idx
  on public.marketplace_supplier_fulfillment_requests(supplier_id, status, created_at desc);

-- A referral can be attached only to the actual buyer's order, within the configured
-- attribution window, and never to the affiliate's own purchase.
create or replace function public.attribute_marketplace_order(p_order_id uuid, p_click_id uuid, p_buyer_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_click public.marketplace_affiliate_clicks%rowtype; v_order public.marketplace_orders%rowtype;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id and buyer_id = p_buyer_id for update;
  if not found or v_order.status not in ('pending_payment','paid') then return false; end if;
  select c.* into v_click from public.marketplace_affiliate_clicks c
    join public.marketplace_affiliates a on a.user_id = c.affiliate_id and a.status = 'approved'
    where c.id = p_click_id and c.clicked_at >= now() - interval '30 days';
  if not found or v_click.affiliate_id = p_buyer_id then return false; end if;
  insert into public.marketplace_order_attributions(order_id, affiliate_id, click_id, buyer_id)
    values (p_order_id, v_click.affiliate_id, p_click_id, p_buyer_id)
    on conflict (order_id) do nothing;
  return found;
end;
$$;

-- Creates an accounting liability only after every seller fulfillment is marked delivered
-- and buyer-confirmed, and no open/reviewing dispute exists. It does not transfer funds.
create or replace function public.prepare_marketplace_affiliate_commission(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.marketplace_orders%rowtype; v_attr public.marketplace_order_attributions%rowtype;
  v_bps integer; v_basis bigint; v_commission bigint; v_row public.marketplace_affiliate_commissions%rowtype;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if not found or v_order.status <> 'paid' then raise exception 'order is not eligible'; end if;
  if exists (select 1 from public.marketplace_disputes where order_id = p_order_id and status in ('open','reviewing')) then
    raise exception 'order has an open dispute';
  end if;
  if exists (select 1 from public.marketplace_fulfillments where order_id = p_order_id and (status <> 'delivered' or buyer_confirmed_at is null))
     or not exists (select 1 from public.marketplace_fulfillments where order_id = p_order_id) then
    raise exception 'all deliveries must be buyer-confirmed';
  end if;
  select * into v_attr from public.marketplace_order_attributions where order_id = p_order_id and attribution_status in ('pending','eligible');
  if not found then return jsonb_build_object('created', false, 'reason', 'no_eligible_attribution'); end if;
  select commission_bps into v_bps from public.marketplace_affiliates where user_id = v_attr.affiliate_id and status = 'approved';
  if not found then raise exception 'affiliate is not approved'; end if;
  select coalesce(sum(line_total_kobo),0) into v_basis from public.marketplace_order_items where order_id = p_order_id;
  if v_basis <= 0 then raise exception 'order has no commissionable items'; end if;
  v_commission := round(v_basis * v_bps / 10000.0)::bigint;
  insert into public.marketplace_affiliate_commissions(order_id, affiliate_id, basis_kobo, commission_bps, commission_kobo, status, eligible_at)
    values (p_order_id, v_attr.affiliate_id, v_basis, v_bps, v_commission, 'pending', now() + interval '7 days')
    on conflict (order_id) do nothing returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.marketplace_affiliate_commissions where order_id = p_order_id;
    return jsonb_build_object('created', false, 'commission', to_jsonb(v_row));
  end if;
  update public.marketplace_order_attributions set attribution_status = 'eligible' where order_id = p_order_id;
  return jsonb_build_object('created', true, 'commission', to_jsonb(v_row));
end;
$$;

alter table public.marketplace_affiliates enable row level security;
alter table public.marketplace_affiliate_clicks enable row level security;
alter table public.marketplace_order_attributions enable row level security;
alter table public.marketplace_affiliate_commissions enable row level security;
alter table public.marketplace_suppliers enable row level security;
alter table public.marketplace_supplier_products enable row level security;
alter table public.marketplace_dropship_listings enable row level security;
alter table public.marketplace_supplier_fulfillment_requests enable row level security;
revoke all on public.marketplace_affiliates, public.marketplace_affiliate_clicks, public.marketplace_order_attributions,
  public.marketplace_affiliate_commissions, public.marketplace_suppliers, public.marketplace_supplier_products,
  public.marketplace_dropship_listings, public.marketplace_supplier_fulfillment_requests from public, anon, authenticated;
grant all on public.marketplace_affiliates, public.marketplace_affiliate_clicks, public.marketplace_order_attributions,
  public.marketplace_affiliate_commissions, public.marketplace_suppliers, public.marketplace_supplier_products,
  public.marketplace_dropship_listings, public.marketplace_supplier_fulfillment_requests to service_role;
revoke all on function public.attribute_marketplace_order(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.prepare_marketplace_affiliate_commission(uuid) from public, anon, authenticated;
grant execute on function public.attribute_marketplace_order(uuid,uuid,uuid) to service_role;
grant execute on function public.prepare_marketplace_affiliate_commission(uuid) to service_role;

-- Supplier stock is reserved from the source catalogue only after payment is
-- confirmed. Listings are synchronised from the supplier's available quantity.
alter table public.marketplace_supplier_products
  add column if not exists reserved_quantity integer not null default 0 check (reserved_quantity >= 0);
alter table public.marketplace_supplier_fulfillment_requests
  add column if not exists stock_restored_at timestamptz;

create or replace function public.sync_marketplace_dropship_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.marketplace_dropship_listings l
     set status = case when new.available_quantity <= 0 and l.status = 'active' then 'supplier_unavailable'
                       when new.available_quantity > 0 and l.status = 'supplier_unavailable' and exists (select 1 from public.marketplace_suppliers s where s.user_id = new.supplier_id and s.verification_status = 'approved') then 'active'
                       else l.status end,
         last_stock_sync_at = now(), updated_at = now()
   where l.supplier_product_id = new.id;
  update public.marketplace_products p
     set stock_quantity = greatest(new.available_quantity, p.reserved_quantity),
         status = case when new.available_quantity <= 0 and p.status = 'active' then 'paused' else p.status end,
         published_at = case when new.available_quantity <= 0 then null else p.published_at end,
         updated_at = now()
    from public.marketplace_dropship_listings l
   where l.supplier_product_id = new.id and l.marketplace_product_id = p.id;
  return new;
end;
$$;
drop trigger if exists marketplace_supplier_stock_sync on public.marketplace_supplier_products;
create trigger marketplace_supplier_stock_sync after update of available_quantity on public.marketplace_supplier_products
for each row when (old.available_quantity is distinct from new.available_quantity)
execute function public.sync_marketplace_dropship_stock();

create or replace function public.enqueue_marketplace_supplier_fulfillment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item record; v_supplier public.marketplace_supplier_products%rowtype; v_supplier_status text;
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;
  for v_item in
    select i.id as order_item_id, i.order_id, i.seller_id, i.product_id, i.quantity, l.supplier_product_id, l.status as listing_status
      from public.marketplace_order_items i
      join public.marketplace_dropship_listings l on l.marketplace_product_id = i.product_id
     where i.order_id = new.id
  loop
    select * into v_supplier from public.marketplace_supplier_products where id = v_item.supplier_product_id for update;
    select verification_status into v_supplier_status from public.marketplace_suppliers where user_id = v_supplier.supplier_id;
    if v_item.listing_status <> 'active' or v_supplier_status <> 'approved' or v_supplier.status <> 'active' or v_supplier.available_quantity < v_item.quantity then
      insert into public.marketplace_supplier_fulfillment_requests(order_item_id,order_id,supplier_id,seller_id,supplier_product_id,quantity,status,last_error)
      values (v_item.order_item_id,v_item.order_id,v_supplier.supplier_id,v_item.seller_id,v_supplier.id,v_item.quantity,'failed','Supplier stock or verification was unavailable when payment was confirmed.')
      on conflict (order_item_id) do nothing;
      insert into public.marketplace_order_events(order_id,event_type,details)
      values (new.id,'supplier_fulfillment_attention_required',jsonb_build_object('order_item_id',v_item.order_item_id,'seller_id',v_item.seller_id));
    else
      update public.marketplace_supplier_products set available_quantity = available_quantity - v_item.quantity, updated_at = now() where id = v_supplier.id;
      insert into public.marketplace_supplier_fulfillment_requests(order_item_id,order_id,supplier_id,seller_id,supplier_product_id,quantity,status)
      values (v_item.order_item_id,v_item.order_id,v_supplier.supplier_id,v_item.seller_id,v_supplier.id,v_item.quantity,'requested')
      on conflict (order_item_id) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists marketplace_paid_order_supplier_fulfillment on public.marketplace_orders;
create trigger marketplace_paid_order_supplier_fulfillment after update of status on public.marketplace_orders
for each row when (new.status = 'paid' and old.status is distinct from new.status)
execute function public.enqueue_marketplace_supplier_fulfillment();

create or replace function public.update_marketplace_supplier_fulfillment(
  p_request_id uuid, p_supplier_id uuid, p_status text, p_supplier_reference text,
  p_tracking_reference text, p_tracking_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_request public.marketplace_supplier_fulfillment_requests%rowtype; v_next text;
begin
  if p_status not in ('accepted','rejected','processing','shipped','delivered','cancelled','failed') then raise exception 'invalid fulfillment status'; end if;
  if p_tracking_url is not null and p_tracking_url !~ '^https://' then raise exception 'tracking URL must use HTTPS'; end if;
  select * into v_request from public.marketplace_supplier_fulfillment_requests where id = p_request_id and supplier_id = p_supplier_id for update;
  if not found then raise exception 'fulfillment request not found'; end if;
  if v_request.status in ('delivered','cancelled','failed','rejected') then raise exception 'fulfillment request is terminal'; end if;
  if p_status = 'shipped' and (coalesce(btrim(p_tracking_reference),'') = '' or p_tracking_url is null) then raise exception 'tracking reference and HTTPS tracking URL are required'; end if;
  update public.marketplace_supplier_fulfillment_requests
     set status = p_status,
         supplier_reference = coalesce(nullif(left(btrim(p_supplier_reference),200),''),supplier_reference),
         tracking_reference = coalesce(nullif(left(btrim(p_tracking_reference),200),''),tracking_reference),
         tracking_url = coalesce(p_tracking_url,tracking_url),
         updated_at = now(),
         stock_restored_at = case when p_status in ('rejected','cancelled','failed') then coalesce(stock_restored_at,now()) else stock_restored_at end
   where id = p_request_id returning * into v_request;
  if p_status in ('rejected','cancelled','failed') and v_request.stock_restored_at is not null then
    update public.marketplace_supplier_products set available_quantity = available_quantity + v_request.quantity, updated_at = now()
     where id = v_request.supplier_product_id;
  end if;
  if p_status in ('shipped','delivered') then
    insert into public.marketplace_fulfillments(order_id,seller_id,status,method,courier_name,tracking_reference,tracking_url,delivery_notes)
    values (v_request.order_id,v_request.seller_id,case when p_status='delivered' then 'delivered' else 'shipped' end,'courier','Supplier fulfilment',v_request.tracking_reference,v_request.tracking_url,'Supplier-provided fulfilment update.')
    on conflict (order_id,seller_id) do update set status=excluded.status,method=excluded.method,courier_name=excluded.courier_name,
      tracking_reference=coalesce(excluded.tracking_reference,marketplace_fulfillments.tracking_reference),
      tracking_url=coalesce(excluded.tracking_url,marketplace_fulfillments.tracking_url),updated_at=now();
  end if;
  insert into public.marketplace_order_events(order_id,event_type,details)
  values (v_request.order_id,'supplier_fulfillment_updated',jsonb_build_object('request_id',v_request.id,'status',p_status,'seller_id',v_request.seller_id));
  return to_jsonb(v_request);
end;
$$;

revoke all on function public.sync_marketplace_dropship_stock() from public,anon,authenticated;
revoke all on function public.enqueue_marketplace_supplier_fulfillment() from public,anon,authenticated;
revoke all on function public.update_marketplace_supplier_fulfillment(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.update_marketplace_supplier_fulfillment(uuid,uuid,text,text,text,text) to service_role;

-- A dropship product becomes sellable only after the normal marketplace
-- moderation workflow approves it and its supplier remains verified/in stock.
create or replace function public.sync_dropship_listing_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from new.status then
    update public.marketplace_dropship_listings l
       set status = case when sp.available_quantity > 0 and s.verification_status = 'approved' then 'active' else 'supplier_unavailable' end,
           updated_at = now()
      from public.marketplace_supplier_products sp, public.marketplace_suppliers s
     where l.marketplace_product_id = new.id and sp.id = l.supplier_product_id and s.user_id = sp.supplier_id;
  elsif new.status in ('rejected','removed') and old.status is distinct from new.status then
    update public.marketplace_dropship_listings set status = 'removed', updated_at = now() where marketplace_product_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_dropship_moderation_sync on public.marketplace_products;
create trigger marketplace_dropship_moderation_sync after update of status on public.marketplace_products
for each row execute function public.sync_dropship_listing_moderation();
revoke all on function public.sync_dropship_listing_moderation() from public,anon,authenticated;


-- Reconcile a dropship listing after a checkout reservation is released or paid.
-- The source supplier stock remains authoritative; reserved quantities are kept
-- as a floor so the existing order reservation constraint is never violated.
create or replace function public.reconcile_reserved_dropship_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.marketplace_products p
     set stock_quantity = greatest(sp.available_quantity, new.reserved_quantity),
         status = case when sp.available_quantity <= 0 and p.status = 'active' then 'paused' else p.status end,
         published_at = case when sp.available_quantity <= 0 then null else p.published_at end,
         updated_at = now()
    from public.marketplace_dropship_listings l
    join public.marketplace_supplier_products sp on sp.id = l.supplier_product_id
   where l.marketplace_product_id = new.id;
  return new;
end;
$$;
drop trigger if exists marketplace_dropship_reserved_stock_sync on public.marketplace_products;
create trigger marketplace_dropship_reserved_stock_sync after update of reserved_quantity on public.marketplace_products
for each row when (old.reserved_quantity is distinct from new.reserved_quantity)
execute function public.reconcile_reserved_dropship_stock();
revoke all on function public.reconcile_reserved_dropship_stock() from public,anon,authenticated;


-- Moves mature commission ledger entries from pending to eligible without
-- transferring money. Payout initiation remains a separate provider-gated flow.
create or replace function public.release_eligible_marketplace_affiliate_commissions(p_affiliate_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.marketplace_affiliate_commissions c
     set status = 'eligible', updated_at = now()
    from public.marketplace_orders o
   where c.order_id = o.id and c.affiliate_id = p_affiliate_id and c.status = 'pending' and c.eligible_at <= now() and o.status = 'paid'
     and exists (select 1 from public.marketplace_fulfillments f where f.order_id = o.id)
     and not exists (select 1 from public.marketplace_fulfillments f where f.order_id = o.id and (f.status <> 'delivered' or f.buyer_confirmed_at is null))
     and not exists (select 1 from public.marketplace_disputes d where d.order_id = o.id and d.status in ('open','reviewing'));
  get diagnostics v_count = row_count;
  update public.marketplace_order_attributions a set attribution_status = 'eligible'
   where a.affiliate_id = p_affiliate_id and a.attribution_status = 'pending' and exists (select 1 from public.marketplace_affiliate_commissions c where c.order_id = a.order_id and c.affiliate_id = p_affiliate_id and c.status = 'eligible');
  return v_count;
end;
$$;
revoke all on function public.release_eligible_marketplace_affiliate_commissions(uuid) from public,anon,authenticated;
grant execute on function public.release_eligible_marketplace_affiliate_commissions(uuid) to service_role;

-- A supplier suspension/rejection immediately pauses every linked dropship
-- listing and its public marketplace product. Re-approval requires the seller
-- to resume the product through normal marketplace moderation again.
create or replace function public.sync_supplier_verification_to_dropship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status is distinct from old.verification_status and new.verification_status <> 'approved' then
    update public.marketplace_dropship_listings set status = 'paused', updated_at = now() where supplier_product_id in (select id from public.marketplace_supplier_products where supplier_id = new.user_id) and status <> 'removed';
    update public.marketplace_products p set status = 'paused', published_at = null, updated_at = now()
      from public.marketplace_dropship_listings l
      join public.marketplace_supplier_products sp on sp.id = l.supplier_product_id
     where l.marketplace_product_id = p.id and sp.supplier_id = new.user_id and p.status = 'active';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_supplier_verification_dropship_sync on public.marketplace_suppliers;
create trigger marketplace_supplier_verification_dropship_sync after update of verification_status on public.marketplace_suppliers
for each row execute function public.sync_supplier_verification_to_dropship();
revoke all on function public.sync_supplier_verification_to_dropship() from public,anon,authenticated;


create or replace function public.pause_dropship_on_supplier_product_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'active' then
    update public.marketplace_dropship_listings set status = 'paused', updated_at = now()
     where supplier_product_id = new.id and status <> 'removed';
    update public.marketplace_products p set status = 'paused', published_at = null, updated_at = now()
      from public.marketplace_dropship_listings l
     where l.marketplace_product_id = p.id and l.supplier_product_id = new.id and p.status = 'active';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_supplier_product_status_dropship_sync on public.marketplace_supplier_products;
create trigger marketplace_supplier_product_status_dropship_sync after update of status on public.marketplace_supplier_products
for each row execute function public.pause_dropship_on_supplier_product_status();
revoke all on function public.pause_dropship_on_supplier_product_status() from public,anon,authenticated;
