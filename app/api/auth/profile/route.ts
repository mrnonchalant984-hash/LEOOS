import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const context = await getProfile(req);
    if (!context) {
      return NextResponse.json(
        { authenticated: false, error: 'Your sign-in session is missing or expired. Please sign in again.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: context.user.id, email: context.user.email },
      profile: {
        onboarding_completed: context.profile.onboarding_completed === true,
        workspace_style: context.profile.workspace_style || 'light',
        onboarding_role: context.profile.onboarding_role || null,
        onboarding_team_size: context.profile.onboarding_team_size || null,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Authenticated profile lookup failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { authenticated: false, error: 'Your account profile could not be reached. Please retry shortly.', code: 'PROFILE_LOOKUP_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
