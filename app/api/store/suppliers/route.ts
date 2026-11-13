import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view supplier operations.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data: supplier, error }, { data: products, error: productsError }, { data: fulfillments, error: fulfillmentError }] = await Promise.all([
    db.from('marketplace_suppliers').select('user_id,business_name,country_code,verification_status,verification_note,created_at,reviewed_at').eq('user_id', user.id).maybeSingle(),
    db.from('marketplace_supplier_products').select('id,supplier_sku,title,description,cost_kobo,currency,available_quantity,status,source_updated_at,created_at,updated_at').eq('supplier_id', user.id).order('updated_at', { ascending: false }).limit(100),
    db.from('marketplace_supplier_fulfillment_requests').select('id,order_id,order_item_id,supplier_product_id,quantity,status,supplier_reference,tracking_reference,tracking_url,last_error,created_at,updated_at').eq('supplier_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (error || productsError || fulfillmentError) return NextResponse.json({ error: 'Supplier workspace is unavailable. Apply the supplier foundation migration.' }, { status: 503 });
  return NextResponse.json({ supplier: supplier ?? null, products: products ?? [], fulfillments: fulfillments ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to apply as a supplier.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-supplier-apply', 2, 86_400); if (limited) return limited;
  const body = await request.json().catch(() => null) as { businessName?: unknown; countryCode?: unknown } | null;
  if (typeof body?.businessName !== 'string' || body.businessName.trim().length < 2 || body.businessName.trim().length > 140 || typeof body.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(body.countryCode)) return NextResponse.json({ error: 'Provide a business name and a two-letter country code.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_suppliers').insert({ user_id: user.id, business_name: body.businessName.trim(), country_code: body.countryCode.toUpperCase() }).select('user_id,business_name,country_code,verification_status,created_at').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'A supplier application already exists.' : 'Supplier application could not be submitted.' }, { status: error.code === '23505' ? 409 : 503 });
  return NextResponse.json({ supplier: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage supplier inventory.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { sku?: unknown; title?: unknown; description?: unknown; costKobo?: unknown; quantity?: unknown } | null;
  if (typeof body?.sku !== 'string' || body.sku.trim().length < 1 || body.sku.length > 100 || typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.length > 180 || (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 10_000)) || !Number.isSafeInteger(body.costKobo) || Number(body.costKobo) <= 0 || !Number.isSafeInteger(body.quantity) || Number(body.quantity) < 0 || Number(body.quantity) > 1_000_000) return NextResponse.json({ error: 'Provide a valid SKU, product title, positive cost in kobo, and non-negative stock quantity.' }, { status: 400 });
  const db = adminSupabase();
  const { data: supplier, error: supplierError } = await db.from('marketplace_suppliers').select('verification_status').eq('user_id', user.id).maybeSingle();
  if (supplierError) return NextResponse.json({ error: 'Supplier verification could not be checked.' }, { status: 503 });
  if (supplier?.verification_status !== 'approved') return NextResponse.json({ error: 'Supplier inventory publishing is available only after supplier verification.' }, { status: 403 });
  const { data, error } = await db.from('marketplace_supplier_products').insert({ supplier_id: user.id, supplier_sku: body.sku.trim(), title: body.title.trim(), description: typeof body.description === 'string' ? body.description.trim() : '', cost_kobo: body.costKobo, available_quantity: body.quantity, status: 'draft' }).select('id,supplier_sku,title,cost_kobo,available_quantity,status,created_at').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That supplier SKU already exists.' : 'Supplier product could not be saved.' }, { status: error.code === '23505' ? 409 : 503 });
  return NextResponse.json({ product: data }, { status: 201 });
}


export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage supplier products.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { productId?: unknown; status?: unknown; quantity?: unknown } | null;
  if (typeof body?.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.productId) || !['active','paused','discontinued'].includes(String(body.status)) || (body.quantity !== undefined && (!Number.isSafeInteger(body.quantity) || Number(body.quantity) < 0 || Number(body.quantity) > 1_000_000))) return NextResponse.json({ error: 'Invalid supplier product update.' }, { status: 400 });
  const db = adminSupabase();
  const { data: supplier, error: supplierError } = await db.from('marketplace_suppliers').select('verification_status').eq('user_id', user.id).maybeSingle();
  if (supplierError) return NextResponse.json({ error: 'Supplier verification could not be checked.' }, { status: 503 });
  if (supplier?.verification_status !== 'approved') return NextResponse.json({ error: 'Only verified suppliers can publish supplier products.' }, { status: 403 });
  const { data: current, error: currentError } = await db.from('marketplace_supplier_products').select('available_quantity').eq('id', body.productId).eq('supplier_id', user.id).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: 'Supplier product not found.' }, { status: currentError ? 503 : 404 });
  const quantity = body.quantity === undefined ? current.available_quantity : Number(body.quantity);
  if (body.status === 'active' && quantity <= 0) return NextResponse.json({ error: 'Add available stock before activating this supplier product.' }, { status: 409 });
  const { data, error } = await db.from('marketplace_supplier_products').update({ status: body.status, available_quantity: quantity, source_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.productId).eq('supplier_id', user.id).select('id,title,status,available_quantity,updated_at').single();
  return error ? NextResponse.json({ error: 'Supplier product could not be updated.' }, { status: 503 }) : NextResponse.json({ product: data });
}
