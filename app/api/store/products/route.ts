import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { productSlug, validateProductInput } from '@/lib/store/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRODUCT_FIELDS = 'id,slug,title,description,category,price,currency,condition,country_code,region,city,created_at';

export async function GET(request: NextRequest) {
  try {
    const db = adminSupabase();
    const params = request.nextUrl.searchParams;
    const query = params.get('q')?.trim().slice(0, 80) ?? '';
    const category = params.get('category')?.trim().slice(0, 80) ?? '';
    const country = params.get('country')?.trim().toUpperCase() ?? '';
    let listingQuery = db.from('marketplace_products')
      .select(PRODUCT_FIELDS)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(24);

    if (query) listingQuery = listingQuery.ilike('title', `%${query.replace(/[%_,]/g, ' ')}%`);
    if (category) listingQuery = listingQuery.eq('category', category);
    if (/^[A-Z]{2}$/.test(country)) listingQuery = listingQuery.eq('country_code', country);

    const { data, error } = await listingQuery;
    if (error) {
      console.error('Marketplace listing query failed:', error.message);
      return NextResponse.json({ error: 'Marketplace listings are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ products: data ?? [] }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('Marketplace configuration is unavailable:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Marketplace listings are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to advertise a product.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const limited = await enforceUserRateLimit(user.id, 'store-listing-submit', 5, 3600);
  if (limited) return limited;

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > 16_384) return NextResponse.json({ error: 'Product details exceed the 16 KB limit.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) return NextResponse.json({ error: 'Product details exceed the 16 KB limit.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) as unknown : null;
  } catch {
    return NextResponse.json({ error: 'Product details must be valid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const validation = validateProductInput(body);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

  try {
    const db = adminSupabase();
    const id = globalThis.crypto.randomUUID();
    const product = validation.value;
    const { data, error } = await db.from('marketplace_products').insert({
      id,
      seller_id: user.id,
      slug: productSlug(product.title, id),
      title: product.title,
      description: product.description,
      category: product.category,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      country_code: product.countryCode,
      region: product.region || null,
      city: product.city,
      status: 'pending_review',
    }).select('id,slug,status').single();

    if (error) {
      console.error('Marketplace listing submission failed:', error.message);
      return NextResponse.json({ error: 'Product could not be submitted. Check that the marketplace migration has been applied.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ product: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Marketplace submission service is unavailable:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Product could not be submitted right now.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
