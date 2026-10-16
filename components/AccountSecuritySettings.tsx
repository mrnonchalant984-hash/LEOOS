'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Image from 'next/image';
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from 'lucide-react';

type TotpFactor = { id: string; status: string; friendly_name?: string };
type Enrollment = { id: string; qrCode: string; secret: string; uri: string };

async function syncSessionCookies(supabase: ReturnType<typeof createBrowserClient>) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Your sign-in session expired. Sign in again to continue.');
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
  if (!response.ok || !result.session) throw new Error(result.error || 'Your verified session could not be updated.');
  const { error: setSessionError } = await supabase.auth.setSession(result.session);
  if (setSessionError) throw setSessionError;
}

export function AccountSecuritySettings({ email, fullName }: { email: string; fullName: string }) {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createBrowserClient(url, key) : null;
  }, []);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const verifiedFactor = factors.find(factor => factor.status === 'verified');
  const pendingFactor = factors.find(factor => factor.status !== 'verified');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: factorError }) => {
      if (!active) return;
      if (factorError) {
        setError(factorError.message);
        return;
      }
      setFactors(data.totp);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Two-factor status could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  async function refreshFactors() {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { data, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) throw factorError;
    setFactors(data.totp);
  }

  async function verifyCode(factorId: string, value: string) {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const verification = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: value.replace(/\s/g, ''),
    });
    if (verification.error) throw verification.error;
  }

  async function beginEnrollment() {
    if (!supabase || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'LeonardX authenticator',
      });
      if (enrollError) throw enrollError;
      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      setNotice('Scan the QR code or enter the setup key in your authenticator app, then verify a current code.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Two-factor enrollment could not be started.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !enrollment || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyCode(enrollment.id, code);
      await syncSessionCookies(supabase);
      setEnrollment(null);
      setCode('');
      await refreshFactors();
      setNotice('Two-factor authentication is enabled for this account.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The authenticator code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  async function removePendingFactor() {
    if (!supabase || !pendingFactor || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
      if (removeError) throw removeError;
      setEnrollment(null);
      await refreshFactors();
      setNotice('The unfinished authenticator setup was removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The unfinished authenticator setup could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !verifiedFactor || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyCode(verifiedFactor.id, disableCode);
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
      if (removeError) throw removeError;
      await syncSessionCookies(supabase);
      setDisableCode('');
      await refreshFactors();
      setNotice('Two-factor authentication has been turned off.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Two-factor authentication could not be disabled.');
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) return <p role="alert" className="rounded-xl border border-red-400/20 bg-red-950/30 p-4 text-sm text-red-200">Supabase authentication is not configured.</p>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-white/10 bg-white/[.04] p-2"><KeyRound size={18}/></span>
        <div><h2 className="text-lg font-semibold">Account</h2><p className="mt-1 text-sm text-zinc-400">Your verified LeonardX sign-in identity.</p></div>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs text-zinc-500">Name</dt><dd className="mt-1 text-sm text-zinc-100">{fullName || 'Not provided'}</dd></div>
        <div><dt className="text-xs text-zinc-500">Email</dt><dd className="mt-1 break-all text-sm text-zinc-100">{email || 'Unavailable'}</dd></div>
      </dl>
    </section>

    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.05] p-2 text-emerald-200"><ShieldCheck size={18}/></span>
        <div><h2 className="text-lg font-semibold">Two-factor authentication</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">Use an authenticator app to verify sign-ins. When enabled, LeonardX asks for a one-time code before protected workspace pages and API actions are available.</p></div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-3 text-sm text-emerald-200">{notice}</p>}
      {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-zinc-400"><LoaderCircle size={15} className="animate-spin"/>Checking account security…</p> : verifiedFactor ? (
        <div className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-100"><CheckCircle2 size={16}/> Authenticator app is enabled</p>
          <p className="mt-1 text-xs text-zinc-400">{verifiedFactor.friendly_name || 'TOTP authenticator'}</p>
          <form onSubmit={disableTwoFactor} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="disable-totp-code">Current authenticator code</label>
            <input id="disable-totp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required value={disableCode} onChange={event => setDisableCode(event.target.value)} placeholder="Current 6-digit code" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"/>
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/20 px-3 py-2 text-sm text-red-100 disabled:opacity-50"><ShieldOff size={15}/>{busy ? 'Verifying…' : 'Turn off 2FA'}</button>
          </form>
        </div>
      ) : enrollment ? (
        <form onSubmit={confirmEnrollment} className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
          <h3 className="font-medium">Set up your authenticator</h3>
          <p className="mt-1 text-sm text-zinc-400">Scan this QR code with an authenticator app. If you cannot scan it, add the setup key manually.</p>
          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Image src={enrollment.qrCode} alt="Authenticator setup QR code" width={180} height={180} unoptimized className="rounded-lg bg-white p-2"/>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">Manual setup key</p>
              <code className="mt-1 block break-all rounded-lg bg-white/[.05] p-3 text-sm text-white">{enrollment.secret}</code>
              <p className="mt-2 break-all text-xs text-zinc-500">{enrollment.uri}</p>
            </div>
          </div>
          <label className="mt-4 block text-sm text-zinc-300" htmlFor="enroll-totp-code">Authenticator code</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input id="enroll-totp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required value={code} onChange={event => setCode(event.target.value)} placeholder="Enter the current 6-digit code" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"/>
            <button disabled={busy} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and enable'}</button>
            <button type="button" disabled={busy} onClick={() => setEnrollment(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50">Cancel</button>
          </div>
        </form>
      ) : pendingFactor ? (
        <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-4">
          <p className="text-sm text-amber-100">There is an unfinished authenticator setup. Remove it and start again to get a new QR code.</p>
          <button type="button" disabled={busy} onClick={() => void removePendingFactor()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50">Remove unfinished setup</button>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-sm text-zinc-400">Two-factor authentication is currently off.</p>
          <button type="button" disabled={busy} onClick={() => void beginEnrollment()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
            {busy ? <LoaderCircle size={15} className="animate-spin"/> : <ShieldCheck size={15}/>} Set up authenticator
          </button>
        </div>
      )}
    </section>
  </div>;
}
