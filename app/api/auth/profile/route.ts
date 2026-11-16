import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
  const { data: profile, error } = await adminSupabase()
    .from('profiles')
    .select('full_name,role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Your profile could not be loaded.' }, { status: 503 });
  const fullName = typeof profile?.full_name === 'string'
    ? profile.full_name
    : typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: fullName,
      role: profile?.role ?? 'user',
      onboarding_complete: fullName.trim().length >= 2,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().replace(/\\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json({ error: 'Enter a name between 2 and 80 characters.' }, { status: 400 });
  }
  const { error } = await adminSupabase()
    .from('profiles')
    .upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: 'Your profile could not be saved.' }, { status: 503 });
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, full_name: fullName, onboarding_complete: true },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
