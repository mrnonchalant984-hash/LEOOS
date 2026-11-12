-- Seller storefront visibility and aggregate seller dashboard access.
drop policy if exists marketplace_delivery_public_read on public.marketplace_delivery_options;
create policy marketplace_delivery_public_read on public.marketplace_delivery_options
  for select to anon, authenticated
  using (
    active and (
      (product_id is null and exists (select 1 from public.marketplace_sellers s where s.user_id = seller_id))
      or exists (select 1 from public.marketplace_products p where p.id = product_id and p.seller_id = seller_id and p.status = 'active')
    )
  );

create or replace function public.get_marketplace_seller_metrics(p_seller_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'inventory', jsonb_build_object(
      'activeListings', (select count(*) from public.marketplace_products p where p.seller_id = p_seller_id and p.status = 'active'),
      'lowStock', (select count(*) from public.marketplace_products p where p.seller_id = p_seller_id and p.status = 'active' and p.stock_quantity - p.reserved_quantity <= 3)
    ),
    'sales', (
      select jsonb_build_object(
        'orderCount', count(distinct o.id),
        'units', coalesce(sum(i.quantity), 0),
        'grossKobo', coalesce(sum(i.line_total_kobo), 0),
        'last30DaysKobo', coalesce(sum(i.line_total_kobo) filter (where o.paid_at >= now() - interval '30 days'), 0),
        'last30DaysOrders', count(distinct o.id) filter (where o.paid_at >= now() - interval '30 days')
      )
      from public.marketplace_order_items i
      join public.marketplace_orders o on o.id = i.order_id
      where i.seller_id = p_seller_id and o.status in ('paid','cancellation_requested','refund_pending')
    )
  );
$$;

revoke all on function public.get_marketplace_seller_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_marketplace_seller_metrics(uuid) to service_role;
