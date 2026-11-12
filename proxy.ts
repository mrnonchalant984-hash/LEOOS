import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function shouldRefresh(token: string) {
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return true;
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { exp?: number };
    return typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() + 90_000;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get('leo_refresh_token')?.value;
  const accessToken = request.cookies.get('leo_access_token')?.value;
  if (!refreshToken || (accessToken && !shouldRefresh(accessToken))) return NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return NextResponse.next({ request });

  request.cookies.set('leo_access_token', data.session.access_token);
  request.cookies.set('leo_refresh_token', data.session.refresh_token);
  const response = NextResponse.next({ request });
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };
  response.cookies.set('leo_access_token', data.session.access_token, cookieOptions);
  response.cookies.set('leo_refresh_token', data.session.refresh_token, cookieOptions);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
