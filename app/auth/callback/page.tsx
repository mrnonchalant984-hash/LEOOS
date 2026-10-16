'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

function safeNextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard';
}

export default function AuthCallbackPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function completeSignIn() {
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error('Authentication is not configured.');
        }
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error('Google sign-in did not return a session. Please try again.');
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }),
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your sign-in session could not be saved.');
        if (!result.session?.access_token || !result.session?.refresh_token) {
          throw new Error('Your sign-in session could not be saved.');
        }
        const { error: syncError } = await supabase.auth.setSession(result.session);
        if (syncError) throw syncError;
        const next = safeNextPath();
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        window.location.replace(assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2'
          ? `/auth/mfa?next=${encodeURIComponent(next)}`
          : next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Google sign-in could not be completed.');
      }
    }
    void completeSignIn();
    return () => { active = false; };
  }, []);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.03] p-7 text-center">
        <h1 className="text-2xl font-bold">Completing sign-in</h1>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>
            <a href="/auth" className="mt-6 inline-flex rounded-lg bg-yellow-400 px-4 py-2 font-semibold text-black">Return to sign in</a>
          </>
        ) : (
          <p role="status" className="mt-3 text-sm text-zinc-400">Verifying your Google account…</p>
        )}
      </section>
    </main>
  );
}
