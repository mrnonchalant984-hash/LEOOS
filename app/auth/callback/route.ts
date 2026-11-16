import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminSupabase, AUTH_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

function safeNext(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value !== '/getting-started'
    ? value
    : '/dashboard';
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/auth?error=oauth_callback_missing_code', request.url));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL('/auth?error=auth_not_configured', request.url));

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(new URL('/auth?error=oauth_exchange_failed', request.url));
  }

  let onboardingCompleted = false;
  try {
    const { data: profile, error: profileError } = await adminSupabase()
      .from('profiles').select('onboarding_completed').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    onboardingCompleted = profile?.onboarding_completed === true;
  } catch {
    return NextResponse.redirect(new URL('/auth?error=profile_check_failed', request.url));
  }

  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const destination = onboardingCompleted ? next : '/getting-started';
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set('leo_access_token', data.session.access_token, AUTH_COOKIE);
  response.cookies.set('leo_refresh_token', data.session.refresh_token, AUTH_COOKIE);
  return response;
}
