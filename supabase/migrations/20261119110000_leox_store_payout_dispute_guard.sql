-- Serialize dispute opening with seller payout preparation and block payouts for disputed orders.
-- Apply only after reviewing this migration against a recoverable non-production database backup.

create or replace function public.lock_marketplace_order_for_dispute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.marketplace_orders where id = new.order_id for update;
  if not found then raise exception 'marketplace order not found'; end if;
  -- The transfer request is sent immediately after payout reservation. Prevent
  -- a dispute from being inserted in the small interval before Paystack accepts
  -- the transfer; the payout worker and dispute trigger serialize on the order.
  if exists (
    select 1 from public.marketplace_seller_payouts
    where order_id = new.order_id and status = 'initiating'
  ) then
    raise exception 'seller payout initiation already in progress';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_marketplace_order_for_dispute() from public, anon, authenticated;

drop trigger if exists marketplace_disputes_lock_order on public.marketplace_disputes;
create trigger marketplace_disputes_lock_order
before insert or update of order_id, status
on public.marketplace_disputes
for each row
when (new.status in ('open', 'reviewing'))
execute function public.lock_marketplace_order_for_dispute();

create or replace function public.prepare_marketplace_seller_payout(p_order_id uuid, p_seller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status text;
  v_recipient text;
  v_gross bigint;
  v_delivery bigint;
  v_commission bigint;
  v_payout public.marketplace_seller_payouts%rowtype;
begin
  select status into v_order_status from public.marketplace_orders where id = p_order_id for update;
  if v_order_status is distinct from 'paid' then raise exception 'order is not eligible for payout'; end if;
  if exists (
    select 1 from public.marketplace_disputes
    where order_id = p_order_id and status in ('open', 'reviewing')
  ) then raise exception 'order has an open dispute'; end if;
  if not exists (
    select 1 from public.marketplace_fulfillments
    where order_id = p_order_id and seller_id = p_seller_id
      and status = 'delivered' and buyer_confirmed_at is not null
  ) then raise exception 'buyer has not confirmed delivery'; end if;
  select recipient_code into v_recipient from public.marketplace_seller_payout_accounts where seller_id = p_seller_id;
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
    p_order_id, p_seller_id, v_recipient,
    'leo_store_payout_' || replace(gen_random_uuid()::text, '-', ''),
    v_gross, v_delivery, 500, v_commission,
    v_gross - v_commission + v_delivery, 'initiating'
  ) on conflict (order_id, seller_id) do nothing returning * into v_payout;
  if v_payout.id is null then
    select * into v_payout from public.marketplace_seller_payouts
      where order_id = p_order_id and seller_id = p_seller_id;
    return jsonb_build_object('created', false, 'payout', to_jsonb(v_payout));
  end if;
  return jsonb_build_object('created', true, 'payout', to_jsonb(v_payout));
end;
$$;

revoke all on function public.prepare_marketplace_seller_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_marketplace_seller_payout(uuid, uuid) to service_role;
