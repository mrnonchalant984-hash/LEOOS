import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { verifyPaystackTransaction } from '@/lib/payments';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to verify this payment.' }, { status: 401 });
  const reference = request.nextUrl.searchParams.get('reference') || '';
  if (!/^leo_store_[A-Za-z0-9_-]{20,100}$/.test(reference)) return NextResponse.json({ error: 'Payment reference is invalid.' }, { status: 400 });
  try {
    const db = adminSupabase();
    const { data: order, error: readError } = await db.from('marketplace_orders').select('id,buyer_id,total_kobo,payment_reference').eq('payment_reference', reference).maybeSingle();
    if (readError || !order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const tx = await verifyPaystackTransaction(reference);
    const metadata = typeof tx.metadata === 'object' && tx.metadata !== null ? tx.metadata as Record<string, unknown> : {};
    const customerEmail = typeof tx.customer?.email === 'string' ? tx.customer.email : '';
    if (Number(tx.amount) !== Number(order.total_kobo) || String(tx.currency).toUpperCase() !== 'NGN' || metadata.type !== 'marketplace_order' || metadata.user_id !== user.id || metadata.order_id !== order.id || (customerEmail && user.email && customerEmail.toLowerCase() !== user.email.toLowerCase())) return NextResponse.json({ error: 'Verified payment does not match this order.' }, { status: 409 });
    const { data: applied, error: applyError } = await db.rpc('apply_marketplace_payment', { p_reference: reference, p_amount_kobo: Number(tx.amount), p_paid_at: tx.paid_at ? new Date(String(tx.paid_at)).toISOString() : new Date().toISOString() });
    if (applyError) throw applyError;
    return NextResponse.json({ paid: true, already_applied: applied === false, order_id: order.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Payment is not confirmed yet. Wait a moment and refresh your orders.' }, { status: 409 });
  }
}
