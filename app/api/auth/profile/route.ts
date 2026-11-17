import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
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
}
