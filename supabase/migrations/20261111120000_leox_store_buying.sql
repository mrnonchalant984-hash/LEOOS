-- Additive buyer checkout foundation. Apply after the Store listing and commerce migrations.
alter table public.marketplace_products
  add column if not exists stock_quantity integer not null default 1,
  add column if not exists reserved_quantity integer not null default 0;

alter table public.marketplace_products
  add constraint marketplace_products_stock_valid check (stock_quantity >= 0 and reserved_quantity >= 0 and reserved_quantity <= stock_quantity);

create table if not exists public.marketplace_cart_items (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, product_id)
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','cancellation_requested','cancelled','refund_pending','refunded','payment_failed','expired','payment_review')),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  subtotal_kobo bigint not null check (subtotal_kobo > 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo),
  payment_reference text not null unique,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  product_id uuid references public.marketplace_products(id) on delete set null,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  slug text not null,
  quantity integer not null check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo > 0),
  line_total_kobo bigint not null check (line_total_kobo = quantity * unit_price_kobo)
);

create table if not exists public.marketplace_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  status text not null default 'requested' check (status in ('requested','pending','processing','processed','failed')),
  provider_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_cart_owner_idx on public.marketplace_cart_items (buyer_id, updated_at desc);
create index if not exists marketplace_order_buyer_idx on public.marketplace_orders (buyer_id, created_at desc);
create index if not exists marketplace_order_item_seller_idx on public.marketplace_order_items (seller_id, order_id);

alter table public.marketplace_cart_items enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_order_items enable row level security;
alter table public.marketplace_order_events enable row level security;
alter table public.marketplace_refunds enable row level security;

create policy marketplace_cart_owner on public.marketplace_cart_items for all to authenticated using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());
create policy marketplace_orders_buyer_read on public.marketplace_orders for select to authenticated using (buyer_id = auth.uid());
create policy marketplace_order_items_participant_read on public.marketplace_order_items for select to authenticated using (
  seller_id = auth.uid() or exists (select 1 from public.marketplace_orders o where o.id = order_id and o.buyer_id = auth.uid())
);
create policy marketplace_order_events_participant_read on public.marketplace_order_events for select to authenticated using (
  exists (select 1 from public.marketplace_orders o where o.id = order_id and o.buyer_id = auth.uid())
  or exists (select 1 from public.marketplace_order_items i where i.order_id = order_id and i.seller_id = auth.uid())
);
create policy marketplace_refunds_buyer_read on public.marketplace_refunds for select to authenticated using (
  exists (select 1 from public.marketplace_orders o where o.id = order_id and o.buyer_id = auth.uid())
);
revoke all on public.marketplace_cart_items, public.marketplace_orders, public.marketplace_order_items, public.marketplace_order_events, public.marketplace_refunds from public, anon;
grant select, insert, update, delete on public.marketplace_cart_items to authenticated;
grant select on public.marketplace_orders, public.marketplace_order_items, public.marketplace_order_events, public.marketplace_refunds to authenticated;
grant all on public.marketplace_cart_items, public.marketplace_orders, public.marketplace_order_items, public.marketplace_order_events, public.marketplace_refunds to service_role;
grant usage, select on sequence public.marketplace_order_events_id_seq to service_role;

create or replace function public.expire_marketplace_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare v_order record; v_count integer := 0;
begin
  for v_order in select id from public.marketplace_orders where status = 'pending_payment' and expires_at < now() for update skip locked loop
    update public.marketplace_products p set reserved_quantity = greatest(0, p.reserved_quantity - i.quantity)
      from public.marketplace_order_items i where i.order_id = v_order.id and i.product_id = p.id;
    insert into public.marketplace_cart_items(buyer_id, product_id, quantity)
      select o.buyer_id, i.product_id, least(100, i.quantity) from public.marketplace_orders o join public.marketplace_order_items i on i.order_id = o.id
      where o.id = v_order.id and i.product_id is not null
      on conflict (buyer_id, product_id) do update set quantity = least(100, public.marketplace_cart_items.quantity + excluded.quantity), updated_at = now();
    update public.marketplace_orders set status = 'expired', updated_at = now() where id = v_order.id;
    insert into public.marketplace_order_events(order_id, event_type) values (v_order.id, 'payment_reservation_expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.create_marketplace_order(p_buyer_id uuid, p_order_id uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_order_number text;
begin
  if p_buyer_id is null or p_order_id is null or p_reference !~ '^leo_store_[A-Za-z0-9_-]{20,100}$' then raise exception 'invalid checkout request'; end if;
  perform public.expire_marketplace_orders();
  if not exists (select 1 from public.marketplace_cart_items where buyer_id = p_buyer_id) then raise exception 'cart is empty'; end if;
  perform 1 from public.marketplace_products p join public.marketplace_cart_items c on c.product_id = p.id where c.buyer_id = p_buyer_id order by p.id for update of p;
  if exists (
    select 1 from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id
    where c.buyer_id = p_buyer_id and (p.status <> 'active' or p.currency <> 'NGN' or p.seller_id = p_buyer_id or p.stock_quantity - p.reserved_quantity < c.quantity)
  ) then raise exception 'cart contains an unavailable item'; end if;
  select sum(round(p.price * 100)::bigint * c.quantity) into v_total
    from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id where c.buyer_id = p_buyer_id;
  if v_total is null or v_total <= 0 or v_total > 100000000000 then raise exception 'checkout amount is invalid'; end if;
  v_order_number := 'LX-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12));
  insert into public.marketplace_orders(id, order_number, buyer_id, subtotal_kobo, total_kobo, payment_reference, expires_at)
  values (p_order_id, v_order_number, p_buyer_id, v_total, v_total, p_reference, now() + interval '20 minutes');
  insert into public.marketplace_order_items(order_id, product_id, seller_id, title, slug, quantity, unit_price_kobo, line_total_kobo)
    select p_order_id, p.id, p.seller_id, p.title, p.slug, c.quantity, round(p.price * 100)::bigint, round(p.price * 100)::bigint * c.quantity
    from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id where c.buyer_id = p_buyer_id;
  update public.marketplace_products p set reserved_quantity = reserved_quantity + c.quantity from public.marketplace_cart_items c where c.buyer_id = p_buyer_id and c.product_id = p.id;
  delete from public.marketplace_cart_items where buyer_id = p_buyer_id;
  insert into public.marketplace_order_events(order_id, actor_id, event_type) values (p_order_id, p_buyer_id, 'checkout_started');
  return jsonb_build_object('id', p_order_id, 'order_number', v_order_number, 'total_kobo', v_total, 'currency', 'NGN');
end $$;

create or replace function public.apply_marketplace_payment(p_reference text, p_amount_kobo bigint, p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_order public.marketplace_orders%rowtype;
begin
  perform public.expire_marketplace_orders();
  select * into v_order from public.marketplace_orders where payment_reference = p_reference for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'paid' then return false; end if;
  if v_order.total_kobo <> p_amount_kobo then raise exception 'order payment amount mismatch'; end if;
  if v_order.status = 'expired' or v_order.expires_at < now() then
    update public.marketplace_orders set status = 'payment_review', paid_at = p_paid_at, updated_at = now() where id = v_order.id;
    insert into public.marketplace_order_events(order_id, event_type, details) values (v_order.id, 'late_payment_review_required', jsonb_build_object('reference', p_reference));
    return true;
  end if;
  if v_order.status <> 'pending_payment' then raise exception 'order is not awaiting payment'; end if;
  update public.marketplace_products p set reserved_quantity = greatest(0, p.reserved_quantity - i.quantity), stock_quantity = stock_quantity - i.quantity,
    status = case when stock_quantity - i.quantity = 0 then 'sold' else status end,
    published_at = case when stock_quantity - i.quantity = 0 then null else published_at end
  from public.marketplace_order_items i where i.order_id = v_order.id and i.product_id = p.id;
  update public.marketplace_orders set status = 'paid', paid_at = p_paid_at, updated_at = now() where id = v_order.id;
  insert into public.marketplace_order_events(order_id, event_type) values (v_order.id, 'payment_confirmed');
  return true;
end $$;

create or replace function public.cancel_marketplace_order(p_order_id uuid, p_buyer_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_order public.marketplace_orders%rowtype;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id and buyer_id = p_buyer_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'pending_payment' then
    update public.marketplace_products p set reserved_quantity = greatest(0, p.reserved_quantity - i.quantity) from public.marketplace_order_items i where i.order_id = v_order.id and i.product_id = p.id;
    insert into public.marketplace_cart_items(buyer_id, product_id, quantity)
      select v_order.buyer_id, i.product_id, least(100, i.quantity) from public.marketplace_order_items i where i.order_id = v_order.id and i.product_id is not null
      on conflict (buyer_id, product_id) do update set quantity = least(100, public.marketplace_cart_items.quantity + excluded.quantity), updated_at = now();
    update public.marketplace_orders set status = 'cancelled', updated_at = now() where id = v_order.id;
    insert into public.marketplace_order_events(order_id, actor_id, event_type) values (v_order.id, p_buyer_id, 'cancelled_before_payment');
    return 'cancelled';
  elsif v_order.status = 'paid' then
    update public.marketplace_orders set status = 'cancellation_requested', updated_at = now() where id = v_order.id;
    insert into public.marketplace_order_events(order_id, actor_id, event_type) values (v_order.id, p_buyer_id, 'cancellation_requested');
    return 'cancellation_requested';
  end if;
  raise exception 'order cannot be cancelled in its current state';
end $$;

revoke all on function public.expire_marketplace_orders(), public.create_marketplace_order(uuid,uuid,text), public.apply_marketplace_payment(text,bigint,timestamptz), public.cancel_marketplace_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.expire_marketplace_orders(), public.create_marketplace_order(uuid,uuid,text), public.apply_marketplace_payment(text,bigint,timestamptz), public.cancel_marketplace_order(uuid,uuid) to service_role;
