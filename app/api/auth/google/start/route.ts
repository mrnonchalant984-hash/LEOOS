import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PUBLIC_ORIGIN = 'https://leoos-omega.vercel.app';

function safeNext(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\\\')
    ? value
    : '/dashboard';
}

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Vary', 'Cookie');
  return response;
}

export async function GET(request: NextRequest) {
  // Pin the OAuth origin to the canonical public hostname. This prevents a
  // proxy/preview hostname from creating PKCE cookies that the callback host
  // cannot receive.
  if (request.nextUrl.origin !== PUBLIC_ORIGIN) {
    return noStore(NextResponse.redirect(new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      PUBLIC_ORIGIN,
    ), 307));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return noStore(NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 }));
  }

  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const redirectTo = new URL('/api/auth/google/callback', PUBLIC_ORIGIN);
  redirectTo.searchParams.set('next', next);

  const pendingCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo.toString(),
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  });

  if (error || !data.url) {
    return noStore(NextResponse.json({ error: error?.message || 'Google sign-in could not be started.' }, { status: 502 }));
  }

  // Apply PKCE/state cookies to the exact redirect response returned to the browser.
  const response = NextResponse.redirect(data.url, 303);
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options as any);
  }
  return noStore(response);
}
