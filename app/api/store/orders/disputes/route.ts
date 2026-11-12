import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to open a dispute.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-order-dispute', 5, 3600); if (limited) return limited;
  const body = await request.json().catch(() => null) as { orderId?: unknown; reason?: unknown; details?: unknown } | null;
  if (typeof body?.orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.orderId) || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 100 || typeof body.details !== 'string' || body.details.trim().length < 3 || body.details.length > 4000) return NextResponse.json({ error: 'Provide an order, reason, and details.' }, { status: 400 });
  const db = adminSupabase();
  const [{ data: order }, { data: sellerItems }] = await Promise.all([
    db.from('marketplace_orders').select('id,buyer_id,status').eq('id',body.orderId).maybeSingle(),
    db.from('marketplace_order_items').select('seller_id').eq('order_id',body.orderId),
  ]);
  if (!order || (order.buyer_id !== user.id && !sellerItems?.some(item => item.seller_id === user.id))) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!['paid','cancellation_requested','cancelled','refunded'].includes(order.status)) return NextResponse.json({ error: 'A dispute can be opened after checkout.' }, { status: 409 });
  const { data, error } = await db.from('marketplace_disputes').insert({ order_id: body.orderId, opened_by: user.id, reason: body.reason.trim(), details: body.details.trim() }).select('id,status,created_at').single();
  return error ? NextResponse.json({ error: 'A dispute may already exist, or could not be opened.' }, { status: 409 }) : NextResponse.json({ dispute: data }, { status: 201 });
}
