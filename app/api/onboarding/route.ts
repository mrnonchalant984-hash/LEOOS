import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKSPACE_STYLES = new Set(['light', 'dark']);
const ROLES = new Set(['Founder', 'Full-Stack Developer', 'Frontend / UI Designer', 'Product Builder', 'Agency / Freelancer', 'Indie Hacker', 'Technical Lead', 'Exploring / Other']);
const TEAM_SIZES = new Set(['Solo Builder', '2–9 Team', '10–99 Company', '100–999 Company', '1,000+ Company']);

export async function POST(request: NextRequest) {
  const context = await getProfile(request);
  if (!context) return NextResponse.json({ error: 'Sign in to save your workspace preferences.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send valid onboarding preferences.' }, { status: 400 });
  const { workspace_style, product_news_opt_out, role, team_size } = body;
  if (!WORKSPACE_STYLES.has(workspace_style) || typeof product_news_opt_out !== 'boolean' || !ROLES.has(role) || !TEAM_SIZES.has(team_size)) {
    return NextResponse.json({ error: 'One or more workspace preferences are invalid.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await adminSupabase().from('profiles').update({
    workspace_style,
    product_news_opt_out,
    onboarding_role: role,
    onboarding_team_size: team_size,
    onboarding_completed: true,
    onboarding_completed_at: now,
  }).eq('id', context.user.id).select('id,onboarding_completed').maybeSingle();
  if (error) {
    console.error('Onboarding profile update failed:', error.message);
    return NextResponse.json({ error: 'Your preferences could not be saved. Please try again.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Your workspace profile is still being prepared. Refresh and try again.' }, { status: 409 });
  return NextResponse.json({ ok: true, onboarding_completed: true }, { headers: { 'Cache-Control': 'no-store' } });
}
