import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { requireVerifiedStoreSeller } from '@/lib/store/seller-access';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: RouteContext<'/api/store/seller/delivery/[id]'>) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage delivery settings.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id); if (sellerAccess) return sellerAccess;
  const { id } = await params; const body = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body.active !== 'boolean') return NextResponse.json({ error: 'Invalid delivery setting.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_delivery_options').update({ active: body.active }).eq('id', id).eq('seller_id', user.id).is('product_id', null).select('id,active').maybeSingle();
  if (error) return NextResponse.json({ error: 'Delivery setting could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Delivery setting not found.' }, { status: 404 });
  return NextResponse.json({ option: data });
}

export async function DELETE(request: NextRequest, { params }: RouteContext<'/api/store/seller/delivery/[id]'>) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage delivery settings.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id); if (sellerAccess) return sellerAccess;
  const { error, count } = await adminSupabase().from('marketplace_delivery_options').delete({ count: 'exact' }).eq('id', (await params).id).eq('seller_id', user.id).is('product_id', null);
  if (error) return NextResponse.json({ error: 'Delivery setting could not be removed.' }, { status: 503 });
  if (!count) return NextResponse.json({ error: 'Delivery setting not found.' }, { status: 404 });
  return NextResponse.json({ removed: true });
}
