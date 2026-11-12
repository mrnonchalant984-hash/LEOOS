import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user?.email) return NextResponse.json({ error: 'Sign in with an account email to check out.' }, { status: 401 });
  if (process.env.STORE_CHECKOUT_ENABLED !== 'true') return NextResponse.json({ error: 'Marketplace checkout is paused until payment, seller payout, delivery and tax settings are confirmed.' }, { status: 503 });
  const limited = await enforceUserRateLimit(user.id, 'store-checkout', 5, 3600); if (limited) return limited;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Marketplace payments are not configured.' }, { status: 503 });
  let base: URL;
  try { base = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : request.nextUrl; }
  catch { return NextResponse.json({ error: 'Secure checkout URL is not configured.' }, { status: 503 }); }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') return NextResponse.json({ error: 'Secure checkout URL is not configured.' }, { status: 503 });
  const db = adminSupabase();
  const orderId = randomUUID();
  const reference = `leo_store_${randomUUID().replaceAll('-', '')}`;
  const { data: order, error: createError } = await db.rpc('create_marketplace_order', { p_buyer_id: user.id, p_order_id: orderId, p_reference: reference });
  if (createError) return NextResponse.json({ error: createError.message.includes('cart is empty') ? 'Your cart is empty.' : 'Some cart items are unavailable. Refresh your cart and try again.' }, { status: 409 });
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, amount: Number(order.total_kobo), currency: 'NGN', reference, callback_url: new URL('/store/payment/return', base.origin).toString(), metadata: { type: 'marketplace_order', user_id: user.id, order_id: orderId, order_number: order.order_number } }),
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => null);
    const url = result?.data?.authorization_url;
    if (!response.ok || result?.status !== true || typeof url !== 'string' || new URL(url).origin !== 'https://checkout.paystack.com') throw new Error('Provider did not return a valid checkout URL.');
    return NextResponse.json({ authorization_url: url, order_id: orderId, order_number: order.order_number }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Keep reserved stock until the 20-minute reservation expires: the provider may have accepted a timed-out initialize request.
    return NextResponse.json({ error: 'Checkout could not be started. Your reserved items will return to stock shortly; check Orders before retrying.' }, { status: 502 });
  }
}
