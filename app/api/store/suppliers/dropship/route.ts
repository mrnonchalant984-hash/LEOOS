import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMS_VERSION = 'braverton-dropship-v1';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view dropship applications.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data: listings, error: listingError }, { data: applications, error: applicationError }] = await Promise.all([
    db.from('marketplace_dropship_listings').select('id,supplier_product_id,marketplace_product_id,selling_price_kobo,status,last_stock_sync_at,created_at,updated_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_dropship_applications').select('id,supplier_product_id,proposed_selling_price_kobo,category,country_code,city,region,supplier_status,supplier_note,terms_version,supplier_terms_version,supplier_agreed_at,created_at,reviewed_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (listingError || applicationError) return NextResponse.json({ error: 'Dropship applications are unavailable.' }, { status: 503 });
  const applicationIds = (applications ?? []).map(item => item.id);
  const { data: events, error: eventsError } = applicationIds.length
    ? await db.from('marketplace_dropship_application_events').select('application_id,event_type,details,created_at').in('application_id', applicationIds).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (eventsError) return NextResponse.json({ error: 'Dropship application history is unavailable.' }, { status: 503 });
  return NextResponse.json({ listings: listings ?? [], applications: (applications ?? []).map(item => ({ ...item, events: (events ?? []).filter(event => event.application_id === item.id) })) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to apply for supplier inventory.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-dropship-apply', 10, 86_400);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    supplierProductId?: unknown; sellingPriceKobo?: unknown; category?: unknown;
    countryCode?: unknown; city?: unknown; region?: unknown; termsAccepted?: unknown;
  } | null;
  if (typeof body?.supplierProductId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.supplierProductId)
    || !Number.isSafeInteger(body.sellingPriceKobo) || Number(body.sellingPriceKobo) <= 0
    || typeof body.category !== 'string' || body.category.trim().length < 1 || body.category.length > 80
    || typeof body.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(body.countryCode)
    || typeof body.city !== 'string' || body.city.trim().length < 1 || body.city.length > 100
    || (body.region !== undefined && (typeof body.region !== 'string' || body.region.length > 100))
    || body.termsAccepted !== true) {
    return NextResponse.json({ error: 'Provide supplier product, selling price, category, country, city and accept the dropship terms.' }, { status: 400 });
  }
  const db = adminSupabase();
  const [{ data: seller, error: sellerError }, { data: supplierProduct, error: productError }] = await Promise.all([
    db.from('marketplace_sellers').select('is_verified').eq('user_id', user.id).maybeSingle(),
    db.from('marketplace_supplier_products').select('id,supplier_id,cost_kobo,currency,available_quantity,status').eq('id', body.supplierProductId).maybeSingle(),
  ]);
  if (sellerError || productError) return NextResponse.json({ error: 'Seller and supplier access could not be checked.' }, { status: 503 });
  if (!seller?.is_verified) return NextResponse.json({ error: 'Seller verification is required before applying for dropship inventory.' }, { status: 403 });
  if (!supplierProduct || supplierProduct.status !== 'active' || supplierProduct.available_quantity <= 0) return NextResponse.json({ error: 'Supplier product is unavailable.' }, { status: 409 });
  if (Number(body.sellingPriceKobo) <= Number(supplierProduct.cost_kobo)) return NextResponse.json({ error: 'Your proposed selling price must exceed supplier cost.' }, { status: 400 });
  const { data: supplier, error: supplierError } = await db.from('marketplace_suppliers')
    .select('verification_status').eq('user_id', supplierProduct.supplier_id).maybeSingle();
  if (supplierError) return NextResponse.json({ error: 'Supplier verification could not be checked.' }, { status: 503 });
  if (supplier?.verification_status !== 'approved') return NextResponse.json({ error: 'Only approved suppliers can accept dropship applications.' }, { status: 403 });
  const { data, error } = await db.from('marketplace_dropship_applications').insert({
    supplier_product_id: supplierProduct.id, supplier_id: supplierProduct.supplier_id,
    seller_id: user.id, proposed_selling_price_kobo: Number(body.sellingPriceKobo), currency: supplierProduct.currency,
    category: body.category.trim(), country_code: body.countryCode.toUpperCase(),
    city: body.city.trim(), region: typeof body.region === 'string' ? body.region.trim() || null : null,
    terms_version: TERMS_VERSION, seller_agreed_at: new Date().toISOString(),
  }).select('id,supplier_product_id,proposed_selling_price_kobo,supplier_status,terms_version,created_at').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'You already have an application for this supplier product.' : 'Dropship application could not be submitted.' }, { status: error.code === '23505' ? 409 : 503 });
  try {
    await notifyMarketplaceUser({
      userId: supplierProduct.supplier_id, kind: 'dropship_application',
      title: 'New Braverton reseller application',
      body: 'A verified reseller has applied to list one of your supplier products. Review the application in your supplier workspace.',
      href: '/store/suppliers', preference: 'support_updates',
      idempotencyKey: `dropship-application:${data.id}:submitted`,
    });
  } catch (noticeError) { console.error('Supplier dropship application notification failed:', noticeError instanceof Error ? noticeError.message : 'unknown error'); }
  return NextResponse.json({ application: data, message: 'Application sent to the supplier. No product listing is published until the supplier approves and Braverton moderation is complete.' }, { status: 201 });
}
