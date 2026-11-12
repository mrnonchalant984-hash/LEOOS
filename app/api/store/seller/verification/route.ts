import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view verification.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data, error }, { data: seller, error: sellerError }] = await Promise.all([
    db.from('marketplace_seller_verification_requests').select('id,business_name,country_code,details,status,reviewer_note,created_at,updated_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(20),
    db.from('marketplace_sellers').select('is_verified').eq('user_id', user.id).maybeSingle(),
  ]);
  return error || sellerError
    ? NextResponse.json({ error: 'Verification requests are unavailable.' }, { status: 503 })
    : NextResponse.json({ verified: seller?.is_verified === true, requests: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to request seller verification.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { businessName?: unknown; countryCode?: unknown; details?: unknown } | null;
  if (typeof body?.businessName !== 'string' || body.businessName.trim().length < 2 || body.businessName.length > 120 || typeof body.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(body.countryCode) || (body.details !== undefined && (typeof body.details !== 'string' || body.details.length > 2000))) return NextResponse.json({ error: 'Provide business name, country code and optional verification context.' }, { status: 400 });
  const limited = await enforceUserRateLimit(user.id, 'store-seller-verification', 5, 86400); if (limited) return limited;
  const db = adminSupabase();
  const { data: seller, error: sellerError } = await db.from('marketplace_sellers').select('is_verified').eq('user_id', user.id).maybeSingle();
  if (sellerError) return NextResponse.json({ error: 'Seller verification status is unavailable.' }, { status: 503 });
  if (seller?.is_verified) return NextResponse.json({ error: 'This seller account is already verified.' }, { status: 409 });
  const { data: pending, error: pendingError } = await db.from('marketplace_seller_verification_requests').select('id').eq('seller_id', user.id).eq('status', 'pending').maybeSingle();
  if (pendingError) return NextResponse.json({ error: 'Verification requests are unavailable.' }, { status: 503 });
  if (pending) return NextResponse.json({ error: 'A verification request is already under review.' }, { status: 409 });
  const { data, error } = await db.from('marketplace_seller_verification_requests').insert({ seller_id: user.id, business_name: body.businessName.trim(), country_code: body.countryCode.toUpperCase(), details: typeof body.details === 'string' ? body.details.trim() : '' }).select('id,status,created_at').single();
  if (error) {
    console.error('Seller verification submission failed:', error.message);
    return NextResponse.json({ error: error.code === '23505' ? 'A verification request is already under review.' : 'The verification request could not be submitted.' }, { status: error.code === '23505' ? 409 : 503 });
  }
  return NextResponse.json({ request: data }, { status: 201 });
}
