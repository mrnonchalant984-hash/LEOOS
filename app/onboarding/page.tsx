'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowRight, LoaderCircle, UserRound } from 'lucide-react';

function getNextPath() {
  const value = new URLSearchParams(window.location.search).get('next');
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value !== '/onboarding'
    ? value
    : '/dashboard';
}

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Authentication is not configured.');
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          window.location.replace('/auth?next=' + encodeURIComponent(window.location.pathname + window.location.search));
          return;
        }
        const response = await fetch('/api/auth/profile', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your profile could not be loaded.');
        if (!active) return;
        setFullName(typeof result.user?.full_name === 'string' ? result.user.full_name : '');
        if (result.user?.onboarding_complete) window.location.replace(getNextPath());
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Your profile could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const name = fullName.trim().replace(/\\s+/g, ' ');
    if (name.length < 2 || name.length > 80) {
      setError('Enter your name using 2 to 80 characters.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ full_name: name }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your profile could not be saved.');
      window.location.replace(getNextPath());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your profile could not be saved.');
      setSaving(false);
    }
  }

  return <main className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#090a0c] px-4 py-12 text-white">
    <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[.035] p-7 shadow-2xl sm:p-10">
      <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><UserRound size={22}/></div>
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-200">One account. One workspace.</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Complete your profile</h1>
      <p className="mt-3 text-sm leading-6 text-white/60">Add your name to finish setting up your LeonardX account. Your profile is saved to your account, not to this browser.</p>
      {loading ? <p role="status" className="mt-8 flex items-center gap-2 text-sm text-white/55"><LoaderCircle size={16} className="animate-spin"/> Loading your profile…</p> : <form onSubmit={saveProfile} className="mt-8 grid gap-4">
        <label className="grid gap-2 text-sm font-medium">Full name<input autoComplete="name" required minLength={2} maxLength={80} value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Enter your full name" className="min-h-12 rounded-xl border border-white/15 bg-black/30 px-4 text-white outline-none focus:border-cyan-300/60"/></label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={saving} className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 font-semibold text-slate-950 disabled:opacity-60">{saving ? <><LoaderCircle size={16} className="animate-spin"/> Saving profile…</> : <>Continue to workspace <ArrowRight size={16}/></>}</button>
      </form>}
    </section>
  </main>;
}
