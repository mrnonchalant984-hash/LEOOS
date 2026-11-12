import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { requireVerifiedStoreSeller } from '@/lib/store/seller-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage delivery settings.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_delivery_options').select('id,name,details,price,currency,active,created_at').eq('seller_id', user.id).is('product_id', null).order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Delivery settings are unavailable.' }, { status: 503 });
  return NextResponse.json({ options: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage delivery settings.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id); if (sellerAccess) return sellerAccess;
  const limited = await enforceUserRateLimit(user.id, 'store-seller-delivery', 30, 3600); if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
  const price = Number(body.price);
  if (name.length < 2 || name.length > 80 || details.length > 500 || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(price) || price < 0 || price > 1_000_000_000_000) return NextResponse.json({ error: 'Enter a valid delivery name, details, currency, and non-negative fee.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_delivery_options').insert({ seller_id: user.id, product_id: null, name, details, price, currency, active: true }).select('id,name,details,price,currency,active,created_at').single();
  if (error) return NextResponse.json({ error: 'Delivery setting could not be saved.' }, { status: 503 });
  return NextResponse.json({ option: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
