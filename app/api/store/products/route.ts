import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { productSlug, validateProductInput } from '@/lib/store/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRODUCT_FIELDS = 'id,slug,title,description,category,price,currency,condition,country_code,region,city,image_urls,created_at';

export async function GET(request: NextRequest) {
  try {
    const db = adminSupabase();
    const params = request.nextUrl.searchParams;
    const query = params.get('q')?.trim().slice(0, 80) ?? '';
    const category = params.get('category')?.trim().slice(0, 80) ?? '';
    const country = params.get('country')?.trim().toUpperCase() ?? '';
    const region = params.get('region')?.trim().slice(0, 100) ?? '';
    const city = params.get('city')?.trim().slice(0, 100) ?? '';
    const currency = params.get('currency')?.trim().toUpperCase() ?? '';
    const minPrice = Number(params.get('minPrice'));
    const maxPrice = Number(params.get('maxPrice'));
    const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1));
    const pageSize = Math.max(1, Math.min(48, Number.parseInt(params.get('pageSize') ?? '24', 10) || 24));
    const from = (page - 1) * pageSize;
    let listingQuery = db.from('marketplace_products')
      .select(PRODUCT_FIELDS)
      .eq('status', 'active')
      .order('published_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (query) listingQuery = listingQuery.ilike('title', `%${query.replace(/[%_,]/g, ' ')}%`);
    if (category) listingQuery = listingQuery.eq('category', category);
    if (/^[A-Z]{2}$/.test(country)) listingQuery = listingQuery.eq('country_code', country);
    if (region) listingQuery = listingQuery.ilike('region', region);
    if (city) listingQuery = listingQuery.ilike('city', city);
    if (/^[A-Z]{3}$/.test(currency)) listingQuery = listingQuery.eq('currency', currency);
    if (Number.isFinite(minPrice) && minPrice >= 0) listingQuery = listingQuery.gte('price', minPrice);
    if (Number.isFinite(maxPrice) && maxPrice >= 0) listingQuery = listingQuery.lte('price', maxPrice);

    const { data, error } = await listingQuery;
    if (error) {
      console.error('Marketplace listing query failed:', error.message);
      return NextResponse.json({ error: 'Marketplace listings are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ products: data ?? [], page, pageSize, hasMore: (data?.length ?? 0) === pageSize }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
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
    const { data: terms, error: termsError } = await db.from('marketplace_prohibited_terms').select('term').eq('active', true).limit(500);
    if (termsError) return NextResponse.json({ error: 'Listing safety checks are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const listingText = `${product.title} ${product.description} ${product.category}`.toLocaleLowerCase();
    const flaggedTerms = (terms ?? []).map(row => row.term as string).filter(term => term.trim().length >= 2 && listingText.includes(term.toLocaleLowerCase())).slice(0, 10);
    const stockQuantity = Number((body as Record<string, unknown>).stockQuantity ?? 1);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > 10_000) return NextResponse.json({ error: 'Available quantity must be from 1 to 10,000.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const imagePaths = Array.isArray((body as Record<string, unknown>).imagePaths) ? (body as Record<string, unknown>).imagePaths as unknown[] : [];
    if (imagePaths.length > 8 || imagePaths.some((path) => typeof path !== 'string' || !new RegExp(`^${user.id}/[0-9a-f-]{36}\\.webp$`, 'i').test(path))) {
      return NextResponse.json({ error: 'Product images must be uploaded to your own Store image area (up to 8 images).' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const imageUrls = imagePaths.map((path) => db.storage.from('marketplace-products').getPublicUrl(path as string).data.publicUrl);
    const { data, error } = await db.from('marketplace_products').insert({
      id,
      seller_id: user.id,
      slug: productSlug(product.title, id),
      title: product.title,
      description: product.description,
      category: product.category,
      price: product.price,
      stock_quantity: stockQuantity,
      currency: product.currency,
      condition: product.condition,
      country_code: product.countryCode,
      region: product.region || null,
      city: product.city,
      image_urls: imageUrls,
      status: 'pending_review',
      moderation_note: flaggedTerms.length ? `Keyword screening flag for moderator review: ${flaggedTerms.join(', ')}` : null,
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
