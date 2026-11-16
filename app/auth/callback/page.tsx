'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { LoaderCircle } from 'lucide-react';

function safeNext(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value !== '/getting-started'
    ? value
    : '/dashboard';
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing secure Google sign-in…');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function complete() {
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Authentication is not configured.');
        const code = new URLSearchParams(window.location.search).get('code');
        if (!code) throw new Error('Google did not return an authentication code. Please try again.');
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError || !data.session) throw exchangeError || new Error('Google sign-in could not be completed.');

        const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
          cache: 'no-store',
        });
        const sessionResult = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) throw new Error(sessionResult.error || 'Your sign-in session could not be secured.');

        const profileResponse = await fetch('/api/auth/profile', {
          headers: { Authorization: 'Bearer ' + sessionResult.session?.access_token },
          cache: 'no-store',
        });
        const profileResult = await profileResponse.json().catch(() => ({}));
        if (!profileResponse.ok || !profileResult.user) throw new Error(profileResult.error || 'Your profile could not be checked.');
        const destination = profileResult.user.onboarding_completed === true
          ? safeNext(new URLSearchParams(window.location.search).get('next'))
          : '/getting-started';
        window.location.replace(destination);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Google sign-in could not be completed.');
        setMessage('');
      }
    }
    void complete();
    return () => { active = false; };
  }, []);

  return <main className="grid min-h-[calc(100vh-80px)] place-items-center bg-[#090a0c] px-4 py-12 text-white"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.035] p-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><LoaderCircle size={22} className={error ? '' : 'animate-spin'}/></div><h1 className="mt-5 text-xl font-semibold">Google sign-in</h1>{message && <p role="status" className="mt-2 text-sm text-white/60">{message}</p>}{error && <div role="alert" className="mt-4"><p className="text-sm text-red-300">{error}</p><a href="/auth" className="mt-4 inline-flex rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Return to sign in</a></div>}</section></main>;
}
