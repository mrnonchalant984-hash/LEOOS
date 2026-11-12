import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user?.email) return NextResponse.json({ error: 'Sign in with an account email to check out.' }, { status: 401 });
  if (process.env.STORE_CHECKOUT_ENABLED !== 'true' || process.env.STORE_PAYOUTS_ENABLED !== 'true') return NextResponse.json({ error: 'Marketplace checkout is paused until payment, seller payouts, delivery and tax settings are confirmed.' }, { status: 503 });
  const limited = await enforceUserRateLimit(user.id, 'store-checkout', 5, 3600); if (limited) return limited;
  const requestBody = await request.json().catch(() => null) as { deliveryOptions?: unknown } | null;
  const invalidDeliveryOptions = !Array.isArray(requestBody?.deliveryOptions)
    || requestBody.deliveryOptions.length > 50
    || requestBody.deliveryOptions.some((entry) => {
      if (typeof entry !== 'object' || entry === null) return true;
      const option = entry as Record<string, unknown>;
      return typeof option.sellerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(option.sellerId)
        || typeof option.optionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(option.optionId);
    });
  if (invalidDeliveryOptions) {
    return NextResponse.json({ error: 'Choose a delivery option for each seller in your cart.' }, { status: 400 });
  }
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Marketplace payments are not configured.' }, { status: 503 });
  let base: URL;
  try { base = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : request.nextUrl; }
  catch { return NextResponse.json({ error: 'Secure checkout URL is not configured.' }, { status: 503 }); }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') return NextResponse.json({ error: 'Secure checkout URL is not configured.' }, { status: 503 });
  const db = adminSupabase();
  const { data: cartItems, error: cartError } = await db.from('marketplace_cart_items').select('product_id').eq('buyer_id', user.id);
  if (cartError) return NextResponse.json({ error: 'Your cart is temporarily unavailable.' }, { status: 503 });
  const productIds = (cartItems ?? []).map((item) => item.product_id);
  if (productIds.length === 0) return NextResponse.json({ error: 'Your cart is empty.' }, { status: 409 });
  const { data: products, error: productsError } = await db.from('marketplace_products').select('id,seller_id,status,currency').in('id', productIds);
  if (productsError) return NextResponse.json({ error: 'Your cart is temporarily unavailable.' }, { status: 503 });
  if (!products || products.length !== productIds.length || products.some((product) => product.status !== 'active')) return NextResponse.json({ error: 'Some cart items are unavailable. Refresh your cart and try again.' }, { status: 409 });
  const sellerIds = [...new Set(products.map((product) => product.seller_id))];
  const { data: verifiedSellers, error: sellersError } = await db.from('marketplace_sellers').select('user_id').in('user_id', sellerIds).eq('is_verified', true);
  if (sellersError) return NextResponse.json({ error: 'Seller verification could not be checked. Please try again.' }, { status: 503 });
  if ((verifiedSellers ?? []).length !== sellerIds.length) return NextResponse.json({ error: 'A seller in your cart is not verified. Remove unavailable items and try again.' }, { status: 409 });
  if (products.some((product) => product.currency !== 'NGN')) return NextResponse.json({ error: 'Checkout currently supports NGN products only.' }, { status: 409 });
  const requestedDelivery = requestBody.deliveryOptions as { sellerId: string; optionId: string }[];
  if (new Set(requestedDelivery.map(option => option.sellerId)).size !== requestedDelivery.length
    || sellerIds.length !== requestedDelivery.length
    || sellerIds.some(id => !requestedDelivery.some(option => option.sellerId === id))) {
    return NextResponse.json({ error: 'Choose exactly one delivery option for each seller.' }, { status: 400 });
  }
  const { data: payoutAccounts, error: payoutAccountError } = await db.from('marketplace_seller_payout_accounts').select('seller_id').in('seller_id', sellerIds);
  if (payoutAccountError) return NextResponse.json({ error: 'Seller payout readiness could not be checked.' }, { status: 503 });
  if ((payoutAccounts ?? []).length !== sellerIds.length) return NextResponse.json({ error: 'A seller has not configured a payout account yet.' }, { status: 409 });
  const orderId = randomUUID();
  const reference = `leo_store_${randomUUID().replaceAll('-', '')}`;
  const deliveryPayload = requestedDelivery.map(option => ({ seller_id: option.sellerId, option_id: option.optionId }));
  const { data: order, error: createError } = await db.rpc('create_marketplace_order', { p_buyer_id: user.id, p_order_id: orderId, p_reference: reference, p_delivery_options: deliveryPayload });
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
