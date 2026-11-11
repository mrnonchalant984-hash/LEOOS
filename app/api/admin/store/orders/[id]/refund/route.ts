import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: RouteContext<'/api/admin/store/orders/[id]/refund'>) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const moderator = await requireOwner(request);
  if (!moderator?.profile.twofa_verified) return NextResponse.json({ error: 'Owner 2FA access required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(moderator.user.id, 'store-refund-issue', 10, 3600); if (limited) return limited;
  const orderId = (await params).id;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || reason.length < 3) return NextResponse.json({ error: 'Provide a valid order and refund reason.' }, { status: 400 });
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment refunds are not configured.' }, { status: 503 });
  const db = adminSupabase();
  const { data: order, error: orderError } = await db.from('marketplace_orders').select('id,order_number,status,total_kobo,payment_reference').eq('id', orderId).maybeSingle();
  if (orderError || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'cancellation_requested') return NextResponse.json({ error: 'Only an order with a reviewed cancellation request can be refunded.' }, { status: 409 });
  const { data: existing } = await db.from('marketplace_refunds').select('id,status').eq('order_id', order.id).maybeSingle();
  if (existing) return NextResponse.json({ error: 'A refund request already exists for this order.' }, { status: 409 });
  const { data: refund, error: createError } = await db.from('marketplace_refunds').insert({ order_id: order.id, requested_by: moderator.user.id, amount_kobo: order.total_kobo, reason, status: 'requested', provider_reference: order.payment_reference }).select('id').single();
  if (createError || !refund) return NextResponse.json({ error: 'Refund could not be registered.' }, { status: 503 });
  try {
    const response = await fetch('https://api.paystack.co/refund', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction: order.payment_reference, amount: Number(order.total_kobo) }), cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.status !== true) {
      await db.from('marketplace_refunds').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', refund.id);
      await db.from('marketplace_order_events').insert({ order_id: order.id, actor_id: moderator.user.id, event_type: 'refund_failed', details: { reason: 'provider_rejected' } });
      return NextResponse.json({ error: 'Paystack did not accept the refund. Review the Paystack dashboard before retrying.' }, { status: 502 });
    }
    await db.from('marketplace_refunds').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', refund.id);
    await db.from('marketplace_orders').update({ status: 'refund_pending', updated_at: new Date().toISOString() }).eq('id', order.id).eq('status', 'cancellation_requested');
    await db.from('marketplace_order_events').insert({ order_id: order.id, actor_id: moderator.user.id, event_type: 'refund_submitted' });
    return NextResponse.json({ accepted: true, status: 'pending', message: 'Paystack accepted the refund request. The order will be marked refunded after provider confirmation.' });
  } catch {
    // Keep the request recorded as pending; timeout can happen after Paystack accepts it.
    await db.from('marketplace_refunds').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', refund.id);
    await db.from('marketplace_orders').update({ status: 'refund_pending', updated_at: new Date().toISOString() }).eq('id', order.id);
    return NextResponse.json({ error: 'Refund submission timed out. Check Paystack before taking further action; the request may have been accepted.' }, { status: 202 });
  }
}
