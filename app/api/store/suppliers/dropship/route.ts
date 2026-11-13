import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view dropship listings.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_dropship_listings').select('id,supplier_product_id,marketplace_product_id,selling_price_kobo,status,last_stock_sync_at,created_at,updated_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(100);
  return error ? NextResponse.json({ error: 'Dropship listings are unavailable.' }, { status: 503 }) : NextResponse.json({ listings: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to create a dropship listing.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { supplierProductId?: unknown; sellingPriceKobo?: unknown; category?: unknown; countryCode?: unknown; city?: unknown; region?: unknown } | null;
  if (typeof body?.supplierProductId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.supplierProductId) || !Number.isSafeInteger(body.sellingPriceKobo) || Number(body.sellingPriceKobo) <= 0 || typeof body.category !== 'string' || body.category.trim().length < 1 || body.category.length > 80 || typeof body.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(body.countryCode) || typeof body.city !== 'string' || body.city.trim().length < 1 || body.city.length > 100 || (body.region !== undefined && (typeof body.region !== 'string' || body.region.length > 100))) return NextResponse.json({ error: 'Provide supplier product, selling price in kobo, category, country and city.' }, { status: 400 });
  const db = adminSupabase();
  const [{ data: seller, error: sellerError }, { data: supplierProduct, error: productError }] = await Promise.all([
    db.from('marketplace_sellers').select('is_verified').eq('user_id', user.id).maybeSingle(),
    db.from('marketplace_supplier_products').select('id,supplier_id,supplier_sku,title,description,cost_kobo,available_quantity,status').eq('id', body.supplierProductId).maybeSingle(),
  ]);
  if (sellerError || productError) return NextResponse.json({ error: 'Seller and supplier access could not be verified.' }, { status: 503 });
  if (!seller?.is_verified) return NextResponse.json({ error: 'Seller verification is required before listing supplier inventory.' }, { status: 403 });
  if (!supplierProduct || supplierProduct.status !== 'active' || supplierProduct.available_quantity <= 0) return NextResponse.json({ error: 'Supplier product is unavailable.' }, { status: 409 });
  if (Number(body.sellingPriceKobo) <= Number(supplierProduct.cost_kobo)) return NextResponse.json({ error: 'Selling price must exceed supplier cost. Account for delivery, platform fees and refunds before publishing.' }, { status: 400 });
  const { data: supplier, error: supplierError } = await db.from('marketplace_suppliers').select('verification_status,country_code').eq('user_id', supplierProduct.supplier_id).maybeSingle();
  if (supplierError) return NextResponse.json({ error: 'Supplier verification could not be checked.' }, { status: 503 });
  if (supplier?.verification_status !== 'approved') return NextResponse.json({ error: 'Only verified suppliers can provide dropship inventory.' }, { status: 403 });
  const slugBase = supplierProduct.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'supplier-product';
  const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;
  const { data: marketplaceProduct, error: marketplaceError } = await db.from('marketplace_products').insert({ seller_id: user.id, slug, title: supplierProduct.title.slice(0, 120), description: (supplierProduct.description || supplierProduct.title).slice(0, 5000), category: body.category.trim(), price: Number(body.sellingPriceKobo) / 100, currency: 'NGN', condition: 'new', country_code: body.countryCode.toUpperCase(), region: typeof body.region === 'string' ? body.region.trim() : null, city: body.city.trim(), status: 'pending_review', image_urls: [], image_paths: [], stock_quantity: supplierProduct.available_quantity, reserved_quantity: 0 }).select('id,slug,title,status').single();
  if (marketplaceError) return NextResponse.json({ error: 'Marketplace listing could not be created.' }, { status: 503 });
  const { data: listing, error: listingError } = await db.from('marketplace_dropship_listings').insert({ seller_id: user.id, supplier_product_id: supplierProduct.id, marketplace_product_id: marketplaceProduct.id, selling_price_kobo: body.sellingPriceKobo, status: 'paused' }).select('id,status,supplier_product_id,marketplace_product_id').single();
  if (listingError) {
    await db.from('marketplace_products').delete().eq('id', marketplaceProduct.id).eq('seller_id', user.id);
    return NextResponse.json({ error: listingError.code === '23505' ? 'This supplier product is already linked to your store.' : 'Dropship link could not be created.' }, { status: listingError.code === '23505' ? 409 : 503 });
  }
  return NextResponse.json({ listing, product: marketplaceProduct, moderation: 'pending_review' }, { status: 201 });
}
