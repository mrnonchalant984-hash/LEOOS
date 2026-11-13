import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { initiateMarketplacePayout } from '@/lib/store-payouts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 });
  const db = adminSupabase();
  const { error: expiryError } = await db.rpc('expire_marketplace_orders');
  if (expiryError) return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  const { data, error } = await db.from('marketplace_orders').select('id,order_number,status,currency,subtotal_kobo,delivery_total_kobo,total_kobo,created_at,paid_at,items:marketplace_order_items(title,slug,quantity,unit_price_kobo,line_total_kobo,seller_id),deliveries:marketplace_order_deliveries(seller_id,name,details,fee_kobo)').eq('buyer_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  const ids = (data ?? []).map(order => order.id);
  const { data: fulfillments, error: fulfillmentError } = ids.length
    ? await db.from('marketplace_fulfillments').select('order_id,seller_id,status,courier_name,tracking_reference,tracking_url,delivery_notes,buyer_confirmed_at').in('order_id', ids)
    : { data: [], error: null };
  if (fulfillmentError) return NextResponse.json({ error: 'Order delivery status is temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ orders: (data ?? []).map(order => ({ ...order, fulfillments: (fulfillments ?? []).filter(item => item.order_id === order.id) })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage your orders.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.orderId) || body.action !== 'cancel') return NextResponse.json({ error: 'Invalid order action.' }, { status: 400 });
  const { data, error } = await adminSupabase().rpc('cancel_marketplace_order', { p_order_id: body.orderId, p_buyer_id: user.id });
  if (error) return NextResponse.json({ error: 'This order cannot be cancelled in its current state.' }, { status: 409 });
  return NextResponse.json({ status: data, message: data === 'cancellation_requested' ? 'Cancellation requested. The seller or support team must review any refund.' : 'Order cancelled.' });
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to confirm delivery.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { orderId?: unknown; sellerId?: unknown } | null;
  if (typeof body?.orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.orderId)
    || typeof body.sellerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.sellerId)) {
    return NextResponse.json({ error: 'Order and seller are required.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: order, error: orderError } = await db.from('marketplace_orders').select('id,buyer_id,status').eq('id', body.orderId).maybeSingle();
  if (orderError || !order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'paid') return NextResponse.json({ error: 'This order is not awaiting delivery confirmation.' }, { status: 409 });
  const { data: fulfillment, error: fulfillmentError } = await db.from('marketplace_fulfillments')
    .update({ buyer_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('order_id', body.orderId).eq('seller_id', body.sellerId).eq('status', 'delivered')
    .is('buyer_confirmed_at', null).select('order_id,seller_id').maybeSingle();
  if (fulfillmentError) return NextResponse.json({ error: 'Delivery confirmation could not be saved.' }, { status: 503 });
  if (!fulfillment) {
    const { data: alreadyConfirmed, error: confirmedError } = await db.from('marketplace_fulfillments')
      .select('order_id,seller_id').eq('order_id', body.orderId).eq('seller_id', body.sellerId)
      .eq('status', 'delivered').not('buyer_confirmed_at', 'is', null).maybeSingle();
    if (confirmedError) return NextResponse.json({ error: 'Delivery confirmation could not be checked.' }, { status: 503 });
    if (!alreadyConfirmed) return NextResponse.json({ error: 'This delivery is not ready for confirmation.' }, { status: 409 });
  }
  const { error: commissionError } = await db.rpc('prepare_marketplace_affiliate_commission', { p_order_id: body.orderId });
  if (commissionError && !/order is not eligible|open dispute|buyer-confirmed|no eligible attribution/i.test(commissionError.message || '')) {
    console.error('Affiliate commission preparation failed:', commissionError.message);
  }
  if (process.env.STORE_PAYOUTS_ENABLED !== 'true') return NextResponse.json({ confirmed: true, payout: 'disabled', affiliate_commission: commissionError ? 'not_prepared' : 'checked' });
  const { data: prepared, error: payoutError } = await db.rpc('prepare_marketplace_seller_payout', { p_order_id: body.orderId, p_seller_id: body.sellerId });
  if (payoutError) return NextResponse.json({ error: 'Delivery was confirmed, but seller settlement could not be started. Contact support.' }, { status: 503 });
  let payoutStatus = String(prepared?.payout?.status ?? 'initiating');
  if (prepared?.created === true && prepared?.payout) {
    try {
      const payout = await initiateMarketplacePayout(prepared.payout);
      payoutStatus = payout.status;
    } catch (error) {
      console.error('Marketplace seller payout initiation failed:', error instanceof Error ? error.message : 'unknown error');
      payoutStatus = 'failed';
    }
  }
  return NextResponse.json({ confirmed: true, payout: payoutStatus });
}
