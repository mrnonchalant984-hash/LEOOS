'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

function safeNextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard';
}

export default function MfaVerificationPage() {
  const router = useRouter();
  const [supabase] = useState(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createBrowserClient(url, key) : null;
  });
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const auth = client.auth;
    let active = true;
    async function prepareVerification() {
      try {
        const { data: sessionData, error: sessionError } = await auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          const next = safeNextPath();
          router.replace(`/auth?next=${encodeURIComponent(next)}`);
          return;
        }
        const { data: assurance, error: assuranceError } = await auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance.currentLevel === 'aal2' || assurance.nextLevel !== 'aal2') {
          router.replace(safeNextPath());
          return;
        }
        const { data: factors, error: factorsError } = await auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const factor = factors.totp.find(item => item.status === 'verified');
        if (!factor) throw new Error('No verified authenticator is available. Contact support to recover account access.');
        if (active) setFactorId(factor.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Two-factor verification could not be prepared.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void prepareVerification();
    return () => { active = false; };
  }, [router, supabase]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId || busy) return;
    setBusy(true);
    setError('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const result = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.replace(/\s/g, ''),
      });
      if (result.error) throw result.error;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('Your verified session could not be loaded.');
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
        cache: 'no-store',
      });
      const refreshed = await response.json().catch(() => ({}));
      if (!response.ok || !refreshed.session) throw new Error(refreshed.error || 'Your verified session could not be saved.');
      const { error: setSessionError } = await supabase.auth.setSession(refreshed.session);
      if (setSessionError) throw setSessionError;
      router.replace(safeNextPath());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The authenticator code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="lx-auth-mfa">
    <section className="lx-auth-mfa-card">
      <div className="lx-auth-mfa-top"><span className="lx-auth-mfa-icon"><ShieldCheck size={20}/></span><ThemeToggle /></div>
      <p className="lx-auth-mfa-eyebrow">Account security</p>
      <h1>Verify it’s you</h1>
      <p className="lx-auth-mfa-description">Enter the current code from your authenticator app to continue to your LeonardX workspace.</p>
      {!supabase ? <p role="alert" className="mt-6 text-sm text-red-200">Supabase authentication is not configured.</p> : loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-zinc-400"><LoaderCircle size={15} className="animate-spin"/>Preparing secure sign-in…</p> : (
        <form onSubmit={verify} className="lx-auth-mfa-form">
          <label htmlFor="mfa-code">Authenticator code</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required value={code} onChange={event => setCode(event.target.value)}/>
          {error && <p role="alert" className="lx-auth-mfa-error">{error}</p>}
          <button disabled={busy || !factorId} className="lx-auth-mfa-submit">
            {busy && <LoaderCircle size={15} className="animate-spin"/>}{busy ? 'Verifying…' : 'Verify and continue'}
          </button>
          <button type="button" onClick={() => {
            if (!supabase) return;
            const client = supabase;
            void (async () => {
              setBusy(true);
              setError('');
              try {
                const { error: signOutError } = await client.auth.signOut();
                if (signOutError) throw signOutError;
                const response = await fetch('/api/auth/logout', { method: 'POST' });
                if (!response.ok) throw new Error('The server could not clear the sign-in session.');
                router.replace('/auth');
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Sign out could not be completed.');
                setBusy(false);
              }
            })();
          }} disabled={busy} className="lx-auth-mfa-signout">Sign out</button>
        </form>
      )}
      {loading && error && <p role="alert" className="lx-auth-mfa-error">{error}</p>}
    </section>
  </main>;
}
