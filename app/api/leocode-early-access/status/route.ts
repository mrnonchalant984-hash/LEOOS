import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { getActiveLeoCodeEntitlement, LEOCODE_DAILY_REQUEST_LIMIT, LEOCODE_DAILY_WINDOW_SECONDS } from '@/lib/leocode-entitlement';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const db = adminSupabase();
  const [{ data: registration, error: registrationError }, entitlementResult] = await Promise.all([
    db.from('leocode_waitlist').select('status,created_at').eq('user_id', context.user.id).maybeSingle(),
    getActiveLeoCodeEntitlement(context.user.id).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
  ]);
  if (registrationError || entitlementResult.error) {
    console.error('LeoCode access status lookup failed', {
      userId: context.user.id,
      error: registrationError?.message || (entitlementResult.error instanceof Error ? entitlementResult.error.message : 'unknown'),
    });
    return NextResponse.json({ error: 'LeoCode access status is temporarily unavailable.' }, { status: 503 });
  }

  const activeEntitlement = entitlementResult.data;
  return NextResponse.json({
    registered: Boolean(registration),
    registrationStatus: activeEntitlement ? 'approved' : registration?.status || null,
    access: activeEntitlement ? {
      active: true,
      startedAt: activeEntitlement.started_at,
      expiresAt: activeEntitlement.expires_at,
      dailyUsageLimit: LEOCODE_DAILY_REQUEST_LIMIT,
      dailyUsageWindowSeconds: LEOCODE_DAILY_WINDOW_SECONDS,
      dailyUsageWindow: 'rolling_24_hours',
      leoUltra: false,
      agencyLeo: false,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
