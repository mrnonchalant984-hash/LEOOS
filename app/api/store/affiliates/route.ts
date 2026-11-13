import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view your affiliate dashboard.' }, { status: 401 });
  const db = adminSupabase();
  const { error: releaseError } = await db.rpc('release_eligible_marketplace_affiliate_commissions', { p_affiliate_id: user.id });
  if (releaseError) return NextResponse.json({ error: 'Affiliate commission eligibility could not be refreshed.' }, { status: 503 });
  const { data: affiliate, error } = await db.from('marketplace_affiliates').select('user_id,referral_code,status,commission_bps,created_at,approved_at').eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Affiliate account is unavailable.' }, { status: 503 });
  if (!affiliate) return NextResponse.json({ affiliate: null, clicks: 0, attributions: [], commissions: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const [clicks, attributions, commissions] = await Promise.all([
    db.from('marketplace_affiliate_clicks').select('id', { count: 'exact', head: true }).eq('affiliate_id', user.id),
    db.from('marketplace_order_attributions').select('order_id,attributed_at,attribution_status').eq('affiliate_id', user.id).order('attributed_at', { ascending: false }).limit(50),
    db.from('marketplace_affiliate_commissions').select('id,order_id,basis_kobo,commission_bps,commission_kobo,status,eligible_at,paid_at,created_at').eq('affiliate_id', user.id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (clicks.error || attributions.error || commissions.error) return NextResponse.json({ error: 'Affiliate analytics could not be loaded.' }, { status: 503 });
  return NextResponse.json({ affiliate, clicks: clicks.count ?? 0, attributions: attributions.data ?? [], commissions: commissions.data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to apply for the affiliate programme.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-affiliate-apply', 2, 86_400);
  if (limited) return limited;
  const code = randomBytes(7).toString('hex').toUpperCase();
  const { data, error } = await adminSupabase().from('marketplace_affiliates').insert({ user_id: user.id, referral_code: code, status: 'pending' }).select('referral_code,status,commission_bps,created_at').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'An affiliate application already exists.' : 'Your affiliate application could not be submitted.' }, { status: error.code === '23505' ? 409 : 503 });
  return NextResponse.json({ affiliate: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
