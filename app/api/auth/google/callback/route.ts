import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
