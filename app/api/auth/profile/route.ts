import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    user: {
      id: context.user.id,
      email: context.user.email,
      full_name: typeof context.profile.full_name === 'string' ? context.profile.full_name : '',
      role: context.profile.role ?? 'user',
      onboarding_complete: typeof context.profile.full_name === 'string' && context.profile.full_name.trim().length >= 2,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().replace(/\\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json({ error: 'Enter a name between 2 and 80 characters.' }, { status: 400 });
  }
  const { error } = await (await import('@/lib/auth')).adminSupabase()
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', context.user.id);
  if (error) return NextResponse.json({ error: 'Your profile could not be saved.' }, { status: 503 });
  return NextResponse.json({ ok: true, user: { id: context.user.id, email: context.user.email, full_name: fullName, onboarding_complete: true } }, { headers: { 'Cache-Control': 'no-store' } });
}
