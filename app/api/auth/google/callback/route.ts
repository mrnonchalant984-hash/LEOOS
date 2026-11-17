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

// Supabase redirects directly to this server endpoint. The code exchange
// happens in the same request/cookie context that created the PKCE verifier.
export async function GET(request: NextRequest) {
  if (request.nextUrl.origin !== PUBLIC_ORIGIN) {
    return noStore(NextResponse.redirect(new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      PUBLIC_ORIGIN,
    ), 307));
  }

  const params = request.nextUrl.searchParams;
  const providerError = params.get('error_description') || params.get('error');
  const next = safeNext(params.get('next'));
  if (providerError) {
    const destination = new URL('/auth', PUBLIC_ORIGIN);
    destination.searchParams.set('error', providerError.slice(0, 240));
    return noStore(NextResponse.redirect(destination, 303));
  }

  const code = params.get('code');
  if (!code || code.length > 4096) {
    const destination = new URL('/auth', PUBLIC_ORIGIN);
    destination.searchParams.set('error', 'Google did not return a valid authentication code. Please try again.');
    return noStore(NextResponse.redirect(destination, 303));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return noStore(NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 }));
  }

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    const destination = new URL('/auth', PUBLIC_ORIGIN);
    destination.searchParams.set('error', (error?.message || 'Google sign-in could not be completed. Please try again.').slice(0, 240));
    return noStore(NextResponse.redirect(destination, 303));
  }

  const destination = new URL('/auth/callback', PUBLIC_ORIGIN);
  destination.searchParams.set('next', next);
  destination.searchParams.set('oauth', 'complete');
  const response = NextResponse.redirect(destination, 303);
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options as any);
  }
  return noStore(response);
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'The authentication callback origin is invalid.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!code || code.length > 4096) {
    return NextResponse.json({ error: 'Google did not return a valid authentication code.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 });
  }

  // Buffer cookie writes until the response is created. This preserves every
  // Supabase cookie option (including expiry, path and same-site settings).
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return NextResponse.json({
      error: error?.message || 'Google sign-in could not be completed. The sign-in cookie may have expired; please try again.',
    }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    user: { id: data.user.id, email: data.user.email },
  }, { headers: { 'Cache-Control': 'no-store' } });
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options as any);
  }
  return response;
}
