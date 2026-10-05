import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AUTH_COOKIE } from '@/lib/auth';
export const runtime = 'nodejs';

function getAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    const normalized = configured.trim().replace(/\/$/, '');
    return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  }
  if (process.env.NODE_ENV === 'production') return 'https://leoos-omega.vercel.app';
  return 'http://localhost:3000';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, full_name } = body ?? {};
    if (!email || !password || password.length < 8) return NextResponse.json({ error: 'Email and a password of at least 8 characters are required.' }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 });
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const cleanName = typeof full_name === 'string' ? full_name.trim() : '';
    const emailRedirectTo = `${getAppBaseUrl()}/auth`;
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: cleanName ? { full_name: cleanName } : {},
      },
    });
    if (error) throw error;
    if (!data.session || !data.user) return NextResponse.json({ ok: true, needsConfirmation: true, message: 'Account created. Check your email to confirm your account, then log in.' });
    const res = NextResponse.json({
      ok: true,
      user: { id: data.user.id, email: data.user.email },
      session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    });
    res.cookies.set('leo_access_token', data.session.access_token, AUTH_COOKIE);
    res.cookies.set('leo_refresh_token', data.session.refresh_token, AUTH_COOKIE);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Sign up failed' }, { status: 400 });
  }
}
