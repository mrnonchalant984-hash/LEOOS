import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: RouteContext<'/api/store/cart/[id]'>) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to update your cart.' }, { status: 401 });
  const { quantity } = await request.json().catch(() => ({}));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return NextResponse.json({ error: 'Quantity must be from 1 to 100.' }, { status: 400 });
  const db = adminSupabase();
  const { data: item } = await db.from('marketplace_cart_items').select('product_id').eq('id', (await params).id).eq('buyer_id', user.id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Cart item not found.' }, { status: 404 });
  const { data: product } = await db.from('marketplace_products').select('stock_quantity,reserved_quantity,status').eq('id', item.product_id).maybeSingle();
  if (!product || product.status !== 'active' || quantity > Number(product.stock_quantity) - Number(product.reserved_quantity)) return NextResponse.json({ error: 'Requested quantity is no longer available.' }, { status: 409 });
  const { error } = await db.from('marketplace_cart_items').update({ quantity, updated_at: new Date().toISOString() }).eq('id', (await params).id).eq('buyer_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not update this cart item.' }, { status: 503 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: NextRequest, { params }: RouteContext<'/api/store/cart/[id]'>) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to update your cart.' }, { status: 401 });
  const { error } = await adminSupabase().from('marketplace_cart_items').delete().eq('id', (await params).id).eq('buyer_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not remove this item.' }, { status: 503 });
  return NextResponse.json({ removed: true });
}
