import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to browse supplier inventory.' }, { status: 401 });
  const db = adminSupabase();
  const { data: seller, error: sellerError } = await db.from('marketplace_sellers')
    .select('is_verified').eq('user_id', user.id).maybeSingle();
  if (sellerError) return NextResponse.json({ error: 'Seller verification could not be checked.' }, { status: 503 });
  if (!seller?.is_verified) return NextResponse.json({ error: 'Verified seller access is required to browse supplier inventory.' }, { status: 403 });
  const { data: suppliers, error: suppliersError } = await db.from('marketplace_suppliers')
    .select('user_id,business_name,country_code').eq('verification_status', 'approved');
  if (suppliersError) return NextResponse.json({ error: 'Approved supplier catalogue is unavailable.' }, { status: 503 });
  const supplierIds = (suppliers ?? []).map(item => item.user_id);
  if (!supplierIds.length) return NextResponse.json({ products: [], applications: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const [{ data: products, error: productsError }, { data: applications, error: applicationsError }] = await Promise.all([
    db.from('marketplace_supplier_products').select('id,supplier_id,supplier_sku,title,description,cost_kobo,currency,available_quantity,updated_at').in('supplier_id', supplierIds).eq('status', 'active').gt('available_quantity', 0).order('updated_at', { ascending: false }).limit(200),
    db.from('marketplace_dropship_applications').select('id,supplier_product_id,supplier_status,proposed_selling_price_kobo,currency,supplier_note,supplier_terms_version,supplier_agreed_at,created_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(200),
  ]);
  if (productsError || applicationsError) return NextResponse.json({ error: 'Supplier catalogue could not be loaded.' }, { status: 503 });
  const applicationIds = (applications ?? []).map(item => item.id);
  const { data: events, error: eventsError } = applicationIds.length
    ? await db.from('marketplace_dropship_application_events').select('application_id,event_type,details,created_at').in('application_id', applicationIds).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (eventsError) return NextResponse.json({ error: 'Dropship application history is unavailable.' }, { status: 503 });
  const supplierById = new Map((suppliers ?? []).map(item => [item.user_id, item]));
  return NextResponse.json({
    products: (products ?? []).map(product => ({ ...product, supplier: supplierById.get(product.supplier_id) ?? null })),
    applications: (applications ?? []).map(item => ({ ...item, events: (events ?? []).filter(event => event.application_id === item.id) })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
