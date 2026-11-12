-- Add buyer-selected delivery fees, seller payout accounting and web-push subscriptions.
-- This migration is additive. Review and apply only through the authorized release process.

alter table public.marketplace_orders
  add column if not exists delivery_total_kobo bigint not null default 0 check (delivery_total_kobo >= 0);

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.marketplace_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%total_kobo = subtotal_kobo%'
  loop
    execute format('alter table public.marketplace_orders drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.marketplace_orders
  add constraint marketplace_orders_total_matches
  check (total_kobo = subtotal_kobo + delivery_total_kobo);

create table if not exists public.marketplace_order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  delivery_option_id uuid references public.marketplace_delivery_options(id) on delete set null,
  name text not null check (length(name) between 2 and 80),
  details text not null default '' check (length(details) <= 500),
  fee_kobo bigint not null check (fee_kobo >= 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  created_at timestamptz not null default now(),
  unique (order_id, seller_id)
);

alter table public.marketplace_fulfillments
  add column if not exists buyer_confirmed_at timestamptz;

alter table public.marketplace_products
  add column if not exists image_paths text[] not null default '{}';

update public.marketplace_products
set image_paths = coalesce((
  select array_agg(regexp_replace(url, '^.*/storage/v1/object/public/marketplace-products/', ''))
  from unnest(image_urls) as url
  where url ~ '^https://[^/]+/storage/v1/object/public/marketplace-products/[^/]+/[0-9a-f-]{36}\.webp$'
)
, '{}')
where cardinality(image_paths) = 0 and cardinality(image_urls) > 0;

create table if not exists public.marketplace_seller_payout_accounts (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  recipient_code text not null unique,
  bank_code text not null check (length(bank_code) between 2 and 20),
  account_name text not null check (length(account_name) between 2 and 120),
  account_last4 char(4) not null check (account_last4 ~ '^[0-9]{4}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  recipient_code text not null,
  reference text not null unique,
  gross_kobo bigint not null check (gross_kobo > 0),
  delivery_kobo bigint not null default 0 check (delivery_kobo >= 0),
  commission_bps integer not null default 500 check (commission_bps = 500),
  commission_kobo bigint not null check (commission_kobo >= 0 and commission_kobo <= gross_kobo),
  net_kobo bigint not null check (net_kobo = gross_kobo - commission_kobo + delivery_kobo and net_kobo > 0),
  status text not null default 'initiating' check (status in ('initiating','pending','paid','failed','reversed')),
  transfer_code text,
  failure_reason text check (failure_reason is null or length(failure_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_id)
);
create index if not exists marketplace_seller_payouts_seller_idx
  on public.marketplace_seller_payouts(seller_id, created_at desc);

create table if not exists public.marketplace_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048 and endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 16 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_push_subscriptions_user_idx
  on public.marketplace_push_subscriptions(user_id);

alter table public.marketplace_order_deliveries enable row level security;
alter table public.marketplace_seller_payout_accounts enable row level security;
alter table public.marketplace_seller_payouts enable row level security;
alter table public.marketplace_push_subscriptions enable row level security;
revoke all on public.marketplace_order_deliveries, public.marketplace_seller_payout_accounts,
  public.marketplace_seller_payouts, public.marketplace_push_subscriptions from public, anon, authenticated;
grant all on public.marketplace_order_deliveries, public.marketplace_seller_payout_accounts,
  public.marketplace_seller_payouts, public.marketplace_push_subscriptions to service_role;

drop function if exists public.create_marketplace_order(uuid, uuid, text);
create function public.create_marketplace_order(
  p_buyer_id uuid,
  p_order_id uuid,
  p_reference text,
  p_delivery_options jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_subtotal bigint;
  v_delivery_total bigint;
  v_order_number text;
  v_seller_count integer;
  v_option_count integer;
begin
  if p_buyer_id is null or p_order_id is null
    or p_reference !~ '^leo_store_[A-Za-z0-9_-]{20,100}$'
    or jsonb_typeof(p_delivery_options) <> 'array' then
    raise exception 'invalid checkout request';
  end if;
  perform public.expire_marketplace_orders();
  if not exists (select 1 from public.marketplace_cart_items where buyer_id = p_buyer_id) then
    raise exception 'cart is empty';
  end if;
  perform 1 from public.marketplace_products p
    join public.marketplace_cart_items c on c.product_id = p.id
    where c.buyer_id = p_buyer_id order by p.id for update of p;
  if exists (
    select 1 from public.marketplace_cart_items c
    join public.marketplace_products p on p.id = c.product_id
    where c.buyer_id = p_buyer_id
      and (p.status <> 'active' or p.currency <> 'NGN' or p.seller_id = p_buyer_id
        or p.stock_quantity - p.reserved_quantity < c.quantity)
  ) then raise exception 'cart contains an unavailable item'; end if;

  select count(distinct p.seller_id) into v_seller_count
  from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id
  where c.buyer_id = p_buyer_id;
  select count(*) into v_option_count from jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid);
  if v_seller_count = 0 or v_seller_count <> v_option_count
    or exists (
      select 1 from jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid)
      group by x.seller_id having count(*) <> 1
    )
    or exists (
      select 1
      from (select distinct p.seller_id from public.marketplace_cart_items c
        join public.marketplace_products p on p.id = c.product_id where c.buyer_id = p_buyer_id) sellers
      left join jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid)
        on x.seller_id = sellers.seller_id
      left join public.marketplace_delivery_options d
        on d.id = x.option_id and d.seller_id = x.seller_id and d.active and d.product_id is null and d.currency = 'NGN'
      where d.id is null
    ) then raise exception 'choose one active NGN delivery option for each seller'; end if;
  perform 1 from public.marketplace_delivery_options d
    join jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid)
      on d.id = x.option_id and d.seller_id = x.seller_id
    for share of d;

  select coalesce(sum(round(p.price * 100)::bigint * c.quantity), 0)
    into v_subtotal
    from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id
    where c.buyer_id = p_buyer_id;
  select coalesce(sum(round(d.price * 100)::bigint), 0)
    into v_delivery_total
    from jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid)
    join public.marketplace_delivery_options d on d.id = x.option_id;
  if v_subtotal <= 0 or v_subtotal + v_delivery_total > 100000000000 then
    raise exception 'checkout amount is invalid';
  end if;
  v_order_number := 'LX-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12));
  insert into public.marketplace_orders(
    id, order_number, buyer_id, subtotal_kobo, delivery_total_kobo, total_kobo, payment_reference, expires_at
  ) values (
    p_order_id, v_order_number, p_buyer_id, v_subtotal, v_delivery_total,
    v_subtotal + v_delivery_total, p_reference, now() + interval '20 minutes'
  );
  insert into public.marketplace_order_deliveries(
    order_id, seller_id, delivery_option_id, name, details, fee_kobo
  )
  select p_order_id, d.seller_id, d.id, d.name, d.details, round(d.price * 100)::bigint
  from jsonb_to_recordset(p_delivery_options) as x(seller_id uuid, option_id uuid)
  join public.marketplace_delivery_options d on d.id = x.option_id;
  insert into public.marketplace_order_items(order_id, product_id, seller_id, title, slug, quantity, unit_price_kobo, line_total_kobo)
  select p_order_id, p.id, p.seller_id, p.title, p.slug, c.quantity,
    round(p.price * 100)::bigint, round(p.price * 100)::bigint * c.quantity
  from public.marketplace_cart_items c join public.marketplace_products p on p.id = c.product_id
  where c.buyer_id = p_buyer_id;
  update public.marketplace_products p set reserved_quantity = p.reserved_quantity + c.quantity
    from public.marketplace_cart_items c where c.buyer_id = p_buyer_id and c.product_id = p.id;
  delete from public.marketplace_cart_items where buyer_id = p_buyer_id;
  insert into public.marketplace_order_events(order_id, actor_id, event_type)
    values (p_order_id, p_buyer_id, 'checkout_started');
  return jsonb_build_object(
    'id', p_order_id, 'order_number', v_order_number, 'subtotal_kobo', v_subtotal,
    'delivery_total_kobo', v_delivery_total, 'total_kobo', v_subtotal + v_delivery_total, 'currency', 'NGN'
  );
end $$;
revoke all on function public.create_marketplace_order(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(uuid, uuid, text, jsonb) to service_role;

create or replace function public.prepare_marketplace_seller_payout(p_order_id uuid, p_seller_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_status text;
  v_recipient text;
  v_gross bigint;
  v_delivery bigint;
  v_commission bigint;
  v_payout public.marketplace_seller_payouts%rowtype;
begin
  select status into v_order_status from public.marketplace_orders where id = p_order_id for update;
  if v_order_status <> 'paid' then raise exception 'order is not eligible for payout'; end if;
  if not exists (select 1 from public.marketplace_fulfillments
    where order_id = p_order_id and seller_id = p_seller_id
      and status = 'delivered' and buyer_confirmed_at is not null) then
    raise exception 'buyer has not confirmed delivery';
  end if;
  select recipient_code into v_recipient
    from public.marketplace_seller_payout_accounts where seller_id = p_seller_id;
  if v_recipient is null then raise exception 'seller payout account is not configured'; end if;
  select coalesce(sum(line_total_kobo), 0) into v_gross
    from public.marketplace_order_items where order_id = p_order_id and seller_id = p_seller_id;
  select coalesce(sum(fee_kobo), 0) into v_delivery
    from public.marketplace_order_deliveries where order_id = p_order_id and seller_id = p_seller_id;
  if v_gross <= 0 then raise exception 'seller has no payable order items'; end if;
  v_commission := round(v_gross * 500 / 10000.0)::bigint;
  insert into public.marketplace_seller_payouts(
    order_id, seller_id, recipient_code, reference, gross_kobo, delivery_kobo,
    commission_bps, commission_kobo, net_kobo, status
  ) values (
    p_order_id, p_seller_id, v_recipient, 'leo_store_payout_' || replace(gen_random_uuid()::text, '-', ''),
    v_gross, v_delivery, 500, v_commission, v_gross - v_commission + v_delivery, 'initiating'
  ) on conflict (order_id, seller_id) do nothing returning * into v_payout;

  if v_payout.id is null then
    select * into v_payout from public.marketplace_seller_payouts
      where order_id = p_order_id and seller_id = p_seller_id;
    return jsonb_build_object('created', false, 'payout', to_jsonb(v_payout));
  end if;
  return jsonb_build_object('created', true, 'payout', to_jsonb(v_payout));
end $$;
revoke all on function public.prepare_marketplace_seller_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_marketplace_seller_payout(uuid, uuid) to service_role;
