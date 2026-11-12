import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { requireVerifiedStoreSeller } from '@/lib/store/seller-access';
import { validateProductInput } from '@/lib/store/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to manage listings.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id);
  if (sellerAccess) return sellerAccess;
  const limited = await enforceUserRateLimit(user.id, 'store-listing-manage', 30, 3600);
  if (limited) return limited;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Listing was not found.' }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === 'edit') {
    const validation = validateProductInput(body);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
    const quantity = Number(body.stockQuantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10_000) return NextResponse.json({ error: 'Inventory must be a whole number from 0 to 10,000.' }, { status: 400 });
    const db = adminSupabase();
    const { data: current, error: readError } = await db.from('marketplace_products').select('status,reserved_quantity').eq('id', id).eq('seller_id', user.id).maybeSingle();
    if (readError || !current) return NextResponse.json({ error: 'Listing was not found.' }, { status: 404 });
    if (quantity < Number(current.reserved_quantity)) return NextResponse.json({ error: 'Inventory cannot be lower than units reserved for checkout.' }, { status: 409 });
    const value = validation.value;
    const requiresReview = current.status === 'active' || current.status === 'rejected';
    const { data, error } = await db.from('marketplace_products').update({
      title: value.title, description: value.description, category: value.category, price: value.price,
      currency: value.currency, condition: value.condition, country_code: value.countryCode,
      region: value.region || null, city: value.city, stock_quantity: quantity,
      ...(requiresReview ? { status: 'pending_review', published_at: null } : {}),
    }).eq('id', id).eq('seller_id', user.id).select('id,slug,status,stock_quantity').maybeSingle();
    if (error) return NextResponse.json({ error: 'Listing could not be saved.' }, { status: 503 });
    return NextResponse.json({ product: data, message: requiresReview ? 'Changes saved. The listing is under review before becoming public again.' : 'Listing updated.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const transitions: Record<string, string> = { pause: 'paused', resume: 'pending_review', sold: 'sold' };
  const status = typeof body?.action === 'string' ? transitions[body.action] : undefined;
  if (!status) return NextResponse.json({ error: 'Choose pause, resume, or sold.' }, { status: 400 });
  const allowedStatuses = body?.action === 'pause' ? ['active'] : body?.action === 'resume' ? ['paused'] : ['active', 'paused'];
  const db = adminSupabase();
  const { data, error } = await db.from('marketplace_products').update({ status, published_at: null }).eq('id', id).eq('seller_id', user.id).in('status', allowedStatuses).select('id,slug,status').maybeSingle();
  if (error) return NextResponse.json({ error: 'Listing could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Listing was not found or cannot make that change.' }, { status: 404 });
  return NextResponse.json({ product: data }, { headers: { 'Cache-Control': 'no-store' } });
}
