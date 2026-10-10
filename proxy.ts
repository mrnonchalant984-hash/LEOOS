import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AUTH_COOKIE } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const access = request.cookies.get('leo_access_token')?.value;
  const refresh = request.cookies.get('leo_refresh_token')?.value;
  if (!access && !refresh) return response;

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (access) {
    const { error } = await sb.auth.getUser(access);
    if (!error) return response;
  }

  if (refresh) {
    const { data } = await sb.auth.refreshSession({ refresh_token: refresh });
    if (data.session) {
      response.cookies.set('leo_access_token', data.session.access_token, AUTH_COOKIE);
      response.cookies.set('leo_refresh_token', data.session.refresh_token, AUTH_COOKIE);
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
