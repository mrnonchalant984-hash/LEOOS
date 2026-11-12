import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view your cart.' }, { status: 401 });
  const db = adminSupabase();
  const { error: expiryError } = await db.rpc('expire_marketplace_orders');
  if (expiryError) return NextResponse.json({ error: 'Your cart is temporarily unavailable.' }, { status: 503 });
  const { data, error } = await db.from('marketplace_cart_items')
    .select('id,quantity,product:marketplace_products(id,seller_id,slug,title,price,currency,image_urls,status,stock_quantity,reserved_quantity)')
    .eq('buyer_id', user.id).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Your cart is temporarily unavailable.' }, { status: 503 });
  const sellerIds = [...new Set((data ?? []).flatMap(item => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    return product?.seller_id ? [product.seller_id] : [];
  }))];
  const { data: deliveryOptions, error: deliveryError } = sellerIds.length
    ? await db.from('marketplace_delivery_options').select('id,seller_id,name,details,price,currency').in('seller_id', sellerIds).is('product_id', null).eq('active', true)
    : { data: [], error: null };
  if (deliveryError) return NextResponse.json({ error: 'Delivery options are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ items: data ?? [], deliveryOptions: deliveryOptions ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to add items to your cart.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-cart-update', 30, 60);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const quantity = Number(body.quantity ?? 1);
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return NextResponse.json({ error: 'Choose a valid product and quantity.' }, { status: 400 });
  const db = adminSupabase();
  const { data: product, error: productError } = await db.from('marketplace_products').select('id,seller_id,status,currency,stock_quantity,reserved_quantity').eq('id', productId).maybeSingle();
  if (productError || !product || product.status !== 'active' || product.seller_id === user.id || product.currency !== 'NGN') return NextResponse.json({ error: 'This item is not available for checkout.' }, { status: 409 });
  const { data: previous } = await db.from('marketplace_cart_items').select('quantity').eq('buyer_id', user.id).eq('product_id', productId).maybeSingle();
  const nextQuantity = quantity + Number(previous?.quantity ?? 0);
  if (nextQuantity > 100 || nextQuantity > Number(product.stock_quantity) - Number(product.reserved_quantity)) return NextResponse.json({ error: 'There is not enough available stock for that quantity.' }, { status: 409 });
  const { error } = await db.from('marketplace_cart_items').upsert({ buyer_id: user.id, product_id: productId, quantity: nextQuantity, updated_at: new Date().toISOString() }, { onConflict: 'buyer_id,product_id' });
  if (error) return NextResponse.json({ error: 'Could not add this item to your cart.' }, { status: 503 });
  return NextResponse.json({ added: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
