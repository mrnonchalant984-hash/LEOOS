import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view seller orders.' }, { status: 401 });
  const db = adminSupabase();
  const { data: rows, error } = await db.from('marketplace_order_items').select('order_id,title,quantity,unit_price_kobo,line_total_kobo,order:marketplace_orders(id,order_number,status,currency,created_at,buyer_id)').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Seller orders are unavailable.' }, { status: 503 });
  const ids = [...new Set((rows ?? []).map(row => row.order_id))];
  const { data: fulfillments } = ids.length ? await db.from('marketplace_fulfillments').select('*').in('order_id', ids).eq('seller_id', user.id) : { data: [] };
  const byOrder = new Map((fulfillments ?? []).map(row => [row.order_id, row]));
  return NextResponse.json({ orders: (rows ?? []).map(row => ({ ...row, fulfillment: byOrder.get(row.order_id) ?? null })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to update fulfillment.' }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = typeof input?.orderId === 'string' && /^[0-9a-f-]{36}$/i.test(input.orderId) ? input.orderId : null;
  const status = input?.status;
  const method = input?.method ?? 'seller_delivery';
  if (!orderId || !['processing', 'shipped', 'delivered', 'delivery_issue', 'cancelled'].includes(String(status)) || !['seller_delivery', 'courier', 'pickup'].includes(String(method))) return NextResponse.json({ error: 'Invalid fulfillment update.' }, { status: 400 });
  const trackingUrl = typeof input?.trackingUrl === 'string' && input.trackingUrl ? input.trackingUrl : null;
  if (trackingUrl && (!trackingUrl.startsWith('https://') || trackingUrl.length > 1000)) return NextResponse.json({ error: 'Tracking links must use HTTPS.' }, { status: 400 });
  const issue = typeof input?.issueDetails === 'string' ? input.issueDetails.trim() : '';
  if (status === 'delivery_issue' && issue.length < 5) return NextResponse.json({ error: 'Describe the delivery issue.' }, { status: 400 });
  const db = adminSupabase();
  const [{ data: items }, { data: order }] = await Promise.all([
    db.from('marketplace_order_items').select('seller_id').eq('order_id', orderId),
    db.from('marketplace_orders').select('id,status,buyer_id').eq('id', orderId).maybeSingle(),
  ]);
  if (!order || !items?.some(item => item.seller_id === user.id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!['paid', 'cancellation_requested'].includes(order.status)) return NextResponse.json({ error: 'This order is not ready for fulfillment updates.' }, { status: 409 });
  const { data, error } = await db.from('marketplace_fulfillments').upsert({ order_id: orderId, seller_id: user.id, status, method, courier_name: typeof input?.courierName === 'string' ? input.courierName.trim().slice(0, 100) : null, tracking_reference: typeof input?.trackingReference === 'string' ? input.trackingReference.trim().slice(0, 200) : null, tracking_url: trackingUrl, delivery_notes: typeof input?.deliveryNotes === 'string' ? input.deliveryNotes.trim().slice(0, 2000) : '', issue_details: status === 'delivery_issue' ? issue.slice(0, 2000) : null, updated_at: new Date().toISOString() }, { onConflict: 'order_id,seller_id' }).select().single();
  if (error) return NextResponse.json({ error: 'Fulfillment could not be updated.' }, { status: 503 });
  await notifyMarketplaceUser({ userId: order.buyer_id, kind: 'fulfillment', title: status === 'delivery_issue' ? 'Delivery update needed' : 'Order delivery updated', body: status === 'delivery_issue' ? issue.slice(0, 1000) : `Your order is now marked ${String(status).replace('_', ' ')}.`, href: '/store/orders', preference: 'order_updates' }).catch(() => undefined);
  return NextResponse.json({ fulfillment: data });
}
