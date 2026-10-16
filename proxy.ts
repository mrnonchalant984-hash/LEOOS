import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AUTH_COOKIE } from '@/lib/auth';

function isMfaExemptPath(pathname: string) {
  return pathname === '/auth/mfa' || pathname === '/auth/callback' || pathname.startsWith('/api/auth/');
}

async function enforceMfa(request: NextRequest, response: NextResponse, sb: SupabaseClient<any, 'public', 'public', any, any>, accessToken: string) {
  const pathname = request.nextUrl.pathname;
  if (isMfaExemptPath(pathname)) return null;

  const { data: assurance, error: assuranceError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (assuranceError) {
    console.error('MFA assurance lookup failed', assuranceError.message);
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

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const access = request.cookies.get('leo_access_token')?.value || bearer;
  const refresh = request.cookies.get('leo_refresh_token')?.value;
  if (!access && !refresh) return response;

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (access) {
    const { error } = await sb.auth.getUser(access);
    if (!error) {
      const gated = await enforceMfa(request, response, sb, access);
      if (gated) return gated;
      return response;
    }
  }

  if (refresh) {
    const { data } = await sb.auth.refreshSession({ refresh_token: refresh });
    if (data.session) {
      response.cookies.set('leo_access_token', data.session.access_token, AUTH_COOKIE);
      response.cookies.set('leo_refresh_token', data.session.refresh_token, AUTH_COOKIE);
      const gated = await enforceMfa(request, response, sb, data.session.access_token);
      if (gated) return gated;
    } else {
      response.cookies.set('leo_access_token', '', { ...AUTH_COOKIE, maxAge: 0 });
      response.cookies.set('leo_refresh_token', '', { ...AUTH_COOKIE, maxAge: 0 });
    }
  }
  return response;
}

export const config = {
  matcher: ['/((?!_monitoring|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
