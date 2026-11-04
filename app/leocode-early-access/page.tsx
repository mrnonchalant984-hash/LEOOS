'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, LockKeyhole } from 'lucide-react';

type AccessStatus = {
  registered: boolean;
  registrationStatus: string | null;
  access: { active: boolean; startedAt: string; expiresAt: string; leoUltra: false; agencyLeo: false } | null;
};

export default function LeoCodeEarlyAccessPage() {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [fullName, setFullName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/leocode-early-access/status', { cache: 'no-store' }).then(async response => {
      if (response.status === 401) { setSignedIn(false); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Access status could not be loaded.');
      setSignedIn(true);
      setStatus(data as AccessStatus);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Access status could not be loaded.'));
  }, []);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/leocode-early-access/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, invitationCode, termsAccepted }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Registration failed.');
      setNotice('Your Founders Early Access is active for 60 days.');
      const next = await fetch('/api/leocode-early-access/status', { cache: 'no-store' });
      if (next.ok) setStatus(await next.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold)]">Founders programme</p>
        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">LeoCode Founders Early Access</h1>
        <p className="mt-5 text-base leading-7 text-zinc-400">Connect LeoCode with your existing LeonardX account and redeem an official invitation for 60 days of eligible access.</p>
      </header>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Clock3 className="text-[var(--gold)]"/><h2 className="mt-4 font-bold">60 days</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Starts when your invitation is successfully redeemed; expiry is enforced server-side.</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><CheckCircle2 className="text-[var(--gold)]"/><h2 className="mt-4 font-bold">No daily quota</h2><p className="mt-2 text-sm leading-6 text-zinc-400">The programme does not remove independent security, provider, or infrastructure limits.</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><LockKeyhole className="text-[var(--gold)]"/><h2 className="mt-4 font-bold">Clear exclusions</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Leo Ultra and Agency Leo are excluded. Invitation access cannot change your subscription or grant admin roles.</p></article>
      </div>
      <section className="mt-8 max-w-2xl rounded-3xl border border-white/10 bg-white/[.04] p-6 sm:p-8">
        {!signedIn ? (
          <div>
            <h2 className="text-xl font-bold">Sign in to continue</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Registration is linked to your verified LeonardX account. We do not create a second account or ask for your password here.</p>
            <Link href="/auth?next=%2Fleocode-early-access" className="mt-5 inline-flex rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black">Sign in to LeonardX</Link>
          </div>
        ) : status?.access?.active ? (
          <div role="status">
            <h2 className="text-xl font-bold">Your access is active</h2>
            <p className="mt-3 text-sm text-zinc-300">Expires {new Date(status.access.expiresAt).toLocaleString()}.</p>
            <p className="mt-3 text-sm text-zinc-500">Leo Ultra and Agency Leo are not included. Your account returns to its normal plan after this entitlement expires.</p>
          </div>
        ) : status?.registered ? (
          <div role="status">
            <h2 className="text-xl font-bold">Registration status: {status.registrationStatus}</h2>
            <p className="mt-2 text-sm text-zinc-400">This account has already redeemed or registered. If access should still be active, contact LeonardX support.</p>
          </div>
        ) : (
          <form onSubmit={redeem}>
            <h2 className="text-xl font-bold">Redeem your invitation</h2>
            <p className="mt-2 text-sm text-zinc-500">Your account email must be verified before an invitation can be used.</p>
            <label className="mt-5 block text-sm text-zinc-300">Full name
              <input required minLength={2} maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--gold)]"/>
            </label>
            <label className="mt-4 block text-sm text-zinc-300">Official invitation code
              <input required maxLength={32} autoCapitalize="characters" value={invitationCode} onChange={event => setInvitationCode(event.target.value.toUpperCase())} placeholder="LEOCODE-EARLY-XXXXXXXXXXXXXXXX" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-white outline-none focus:border-[var(--gold)]"/>
            </label>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-zinc-400">
              <input required type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} className="mt-1 accent-yellow-400"/>
              <span>I accept the Founders Early Access terms and understand the 60-day duration, exclusions, and normal-plan restoration.</span>
            </label>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">{notice}</p>}
            <button disabled={busy} className="mt-6 w-full rounded-xl bg-[var(--gold)] px-5 py-3.5 font-bold text-black disabled:opacity-60">{busy ? 'Checking invitation…' : 'Activate 60-day access'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
