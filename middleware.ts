import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

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

function isMfaExemptPath(pathname: string) {
  return pathname === '/auth/mfa' || pathname === '/auth/callback' || pathname.startsWith('/api/auth/');
}

async function enforceMfa(
  request: NextRequest,
  response: NextResponse,
  supabase: SupabaseClient<any, 'public', 'public', any, any>,
  accessToken: string,
) {
  const pathname = request.nextUrl.pathname;
  if (isMfaExemptPath(pathname)) return null;

  const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (error) {
    console.error('MFA assurance lookup failed', error.message);
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Two-factor status could not be verified. Retry shortly.' }, { status: 503 })
      : NextResponse.redirect(new URL(`/auth/mfa?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`, request.url));
  }
  if (assurance.nextLevel !== 'aal2' || assurance.currentLevel === 'aal2') return null;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({
      error: 'Two-factor authentication is required to continue.',
      code: 'MFA_REQUIRED',
      verification_url: `/auth/mfa?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`,
    }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.redirect(new URL(`/auth/mfa?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`, request.url));
}

// OpenNext deploys this request interceptor at the edge. Next's legacy
// middleware convention requires the explicit experimental runtime label.
export const runtime = 'experimental-edge';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const accessToken = request.cookies.get('leo_access_token')?.value || bearer;
  const refreshToken = request.cookies.get('leo_refresh_token')?.value;
  if (!accessToken && !refreshToken) return response;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let validAccessToken = false;
  if (accessToken) {
    const { error } = await supabase.auth.getUser(accessToken);
    validAccessToken = !error;
    if (validAccessToken && (!refreshToken || !shouldRefresh(accessToken))) {
      return (await enforceMfa(request, response, supabase, accessToken)) ?? response;
    }
  }

  if (!refreshToken) return response;
  const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (!data.session) {
    if (validAccessToken && accessToken) {
      return (await enforceMfa(request, response, supabase, accessToken)) ?? response;
    }
    response.cookies.set('leo_access_token', '', { ...AUTH_COOKIE, maxAge: 0 });
    response.cookies.set('leo_refresh_token', '', { ...AUTH_COOKIE, maxAge: 0 });
    return response;
  }

  request.cookies.set('leo_access_token', data.session.access_token);
  request.cookies.set('leo_refresh_token', data.session.refresh_token);
  response = NextResponse.next({ request });
  response.cookies.set('leo_access_token', data.session.access_token, AUTH_COOKIE);
  response.cookies.set('leo_refresh_token', data.session.refresh_token, AUTH_COOKIE);
  const gated = await enforceMfa(request, response, supabase, data.session.access_token);
  if (gated) return gated;
  return response;
}

export const config = {
  matcher: ['/((?!_monitoring|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
