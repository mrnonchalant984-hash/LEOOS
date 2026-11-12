import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 });
  const db = adminSupabase();
  const { error: expiryError } = await db.rpc('expire_marketplace_orders');
  if (expiryError) return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  const { data, error } = await db.from('marketplace_orders').select('id,order_number,status,currency,total_kobo,created_at,paid_at,items:marketplace_order_items(title,slug,quantity,unit_price_kobo,line_total_kobo)').eq('buyer_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ orders: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
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
