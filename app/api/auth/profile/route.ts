import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

function profilePayload(context: NonNullable<Awaited<ReturnType<typeof getProfile>>>) {
  return {
    id: context.user.id,
    email: context.user.email,
    full_name: typeof context.profile.full_name === 'string' ? context.profile.full_name : '',
    role: context.profile.role ?? 'user',
    onboarding_role: context.profile.onboarding_role ?? null,
    company_size: context.profile.company_size ?? null,
    theme_preference: context.profile.theme_preference === 'dark' ? 'dark' : 'light',
    email_opt_out: context.profile.email_opt_out === true,
    onboarding_completed: context.profile.onboarding_completed === true,
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getProfile(req);
    if (!context) return NextResponse.json({ authenticated: false, error: 'Your sign-in session is missing or expired. Please sign in again.' }, { status: 401 });
    return NextResponse.json({ authenticated: true, user: profilePayload(context) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Authenticated profile lookup failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: 'Your sign-in succeeded, but the account profile service is temporarily unavailable. Please retry shortly.',
      code: 'PROFILE_LOOKUP_UNAVAILABLE',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function PATCH(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid profile update is required.' }, { status: 400 });
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json({ error: 'Enter a name between 2 and 80 characters.' }, { status: 400 });
  }

  const isOnboardingSubmission = body.onboarding_completed === true;
  const updates: Record<string, unknown> = { full_name: fullName };
  if (isOnboardingSubmission) {
    const roles = new Set(['developer', 'founder', 'designer', 'student', 'business', 'other']);
    const companySizes = new Set(['just_me', '2_10', '11_50', '51_200', '201_plus']);
    if (!roles.has(body.onboarding_role) || !companySizes.has(body.company_size)
      || !['light', 'dark'].includes(body.theme_preference)
      || typeof body.email_opt_out !== 'boolean') {
      return NextResponse.json({ error: 'Complete each onboarding choice before continuing.' }, { status: 400 });
    }
    updates.onboarding_role = body.onboarding_role;
    updates.company_size = body.company_size;
    updates.theme_preference = body.theme_preference;
    updates.email_opt_out = body.email_opt_out;
    updates.onboarding_completed = true;
  }

  const { data, error } = await adminSupabase()
    .from('profiles')
    .update(updates)
    .eq('id', context.user.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Your profile could not be saved. Confirm the unified onboarding migration has been applied.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Your profile record could not be found.' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: {
      ...profilePayload({ ...context, profile: { ...context.profile, ...updates } } as NonNullable<typeof context>),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
