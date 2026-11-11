import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view saved products.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_saved_products').select('created_at,product:marketplace_products(id,slug,title,price,currency,city,country_code,image_urls,status)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Saved products are unavailable.' }, { status: 503 });
  return NextResponse.json({ products: (data ?? []).map((row: any) => row.product).filter((product: any) => product?.status === 'active') }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to save products.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { productId?: unknown; action?: unknown } | null;
  if (typeof body?.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.productId)) return NextResponse.json({ error: 'Choose a valid product.' }, { status: 400 });
  const db = adminSupabase();
  if (body.action === 'remove') {
    const { error } = await db.from('marketplace_saved_products').delete().eq('user_id', user.id).eq('product_id', body.productId);
    return error ? NextResponse.json({ error: 'Saved product could not be removed.' }, { status: 503 }) : NextResponse.json({ saved: false });
  }
  const { data: product } = await db.from('marketplace_products').select('id').eq('id', body.productId).eq('status', 'active').maybeSingle();
  if (!product) return NextResponse.json({ error: 'Product is not available.' }, { status: 404 });
  const { error } = await db.from('marketplace_saved_products').upsert({ user_id: user.id, product_id: body.productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
  return error ? NextResponse.json({ error: 'Product could not be saved.' }, { status: 503 }) : NextResponse.json({ saved: true }, { status: 201 });
}
