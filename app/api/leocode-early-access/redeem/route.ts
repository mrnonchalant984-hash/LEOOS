import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceIpRateLimit, enforceUserRateLimit } from '@/lib/rate-limit';
import { hashInvitationCode, normalizeInvitationCode } from '@/lib/leocode-access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Sign in to your verified LeonardX account first.' }, { status: 401 });
  if (!context.user.email || !context.user.email_confirmed_at) {
    return NextResponse.json({ error: 'Verify your LeonardX email before joining Founders Early Access.' }, { status: 403 });
  }

  const limited = await enforceUserRateLimit(context.user.id, 'leocode-early-access-redeem', 5, 3600);
  if (limited) return limited;
  const ipLimited = await enforceIpRateLimit(req, 'leocode-early-access-redeem-ip', 12, 3600);
  if (ipLimited) return ipLimited;

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Enter the required registration details.' }, { status: 400 });
  const values = body as Record<string, unknown>;
  const fullName = typeof values.fullName === 'string' ? values.fullName.trim() : '';
  const code = normalizeInvitationCode(values.invitationCode);
  if (fullName.length < 2 || fullName.length > 120 || !code || values.termsAccepted !== true) {
    return NextResponse.json({ error: 'Enter your name, a valid invitation code, and accept the programme terms.' }, { status: 400 });
  }

  try {
    const { data: entitlementId, error } = await adminSupabase().rpc('redeem_leocode_invitation', {
      p_user_id: context.user.id,
      p_full_name: fullName,
      p_email: context.user.email,
      p_code_hash: hashInvitationCode(code),
      p_terms_accepted_at: new Date().toISOString(),
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('already_redeemed') || error.code === '23505') {
        return NextResponse.json({ error: 'This LeonardX account has already used a Founders invitation.' }, { status: 409 });
      }
      if (message.includes('verified_account_required')) {
        return NextResponse.json({ error: 'Verify your LeonardX email before joining Founders Early Access.' }, { status: 403 });
      }
      if (message.includes('invitation_unavailable')) {
        return NextResponse.json({ error: 'This invitation code is invalid, expired, inactive, or fully redeemed.' }, { status: 400 });
      }
      console.error('LeoCode invitation redemption failed', { userId: context.user.id, code: error.code });
      return NextResponse.json({ error: 'Registration could not be completed. Please try again later.' }, { status: 503 });
    }
    if (typeof entitlementId !== 'string') {
      console.error('LeoCode redemption returned no entitlement ID', { userId: context.user.id });
      return NextResponse.json({ error: 'Registration could not be confirmed. Please contact support.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, expiresInDays: 60 }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('LeoCode invitation redemption unavailable', {
      userId: context.user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Registration could not be completed. Please try again later.' }, { status: 503 });
  }
}
