import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AUTH_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'The authentication callback origin is invalid.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
  if (!accessToken || accessToken.length > 8192 || !refreshToken || refreshToken.length > 8192) {
    return NextResponse.json({ error: 'A valid Supabase session is required.' }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ error: 'The Google sign-in session could not be verified.' }, { status: 401 });
  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (refreshError || !refreshedData.session || refreshedData.user?.id !== userData.user.id) {
    return NextResponse.json({ error: 'The Google sign-in session could not be verified.' }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    user: { id: refreshedData.user.id, email: refreshedData.user.email },
    session: {
      access_token: refreshedData.session.access_token,
      refresh_token: refreshedData.session.refresh_token,
    },
  });
  response.cookies.set('leo_access_token', refreshedData.session.access_token, AUTH_COOKIE);
  response.cookies.set('leo_refresh_token', refreshedData.session.refresh_token, AUTH_COOKIE);
  return response;
}
