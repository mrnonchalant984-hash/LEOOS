'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Moon, Sun, UserRound } from 'lucide-react';
import { useThemePreference } from '@/components/theme-provider';

const roles = [
  ['developer', 'Developer'],
  ['founder', 'Founder'],
  ['designer', 'Designer'],
  ['student', 'Student'],
  ['business', 'Business / team'],
  ['other', 'Other'],
] as const;
const companySizes = [
  ['just_me', 'Just me'],
  ['2_10', '2–10 people'],
  ['11_50', '11–50 people'],
  ['51_200', '51–200 people'],
  ['201_plus', '201+ people'],
] as const;

export default function GettingStartedPage() {
  const { setTheme } = useThemePreference();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('developer');
  const [companySize, setCompanySize] = useState('just_me');
  const [theme, setThemeChoice] = useState<'light' | 'dark'>('light');
  const [emailOptOut, setEmailOptOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Authentication is not configured.');
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) { window.location.replace('/auth'); return; }
        const response = await fetch('/api/auth/profile', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your profile could not be loaded.');
        if (!active) return;
        const user = result.user || {};
        setFullName(typeof user.full_name === 'string' ? user.full_name : '');
        setRole(roles.some(([value]) => value === user.onboarding_role) ? user.onboarding_role : 'developer');
        setCompanySize(companySizes.some(([value]) => value === user.company_size) ? user.company_size : 'just_me');
        setThemeChoice(user.theme_preference === 'dark' ? 'dark' : 'light');
        setEmailOptOut(user.email_opt_out === true);
        if (user.onboarding_completed === true) window.location.replace('/dashboard?welcome=true');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Your profile could not be loaded.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  function nextStep() {
    setError('');
    if (step === 0 && fullName.trim().replace(/\\s+/g, ' ').length < 2) { setError('Enter your name to continue.'); return; }
    setStep(value => Math.min(3, value + 1));
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const name = fullName.trim().replace(/\\s+/g, ' ');
    if (name.length < 2 || name.length > 80) { setError('Enter a name between 2 and 80 characters.'); setStep(0); return; }
    setSaving(true);
    try {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({
          full_name: name,
          onboarding_role: role,
          company_size: companySize,
          theme_preference: theme,
          email_opt_out: emailOptOut,
          onboarding_completed: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your profile could not be saved.');
      setTheme(theme);
      window.location.replace('/dashboard?welcome=true');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your profile could not be saved.');
      setSaving(false);
    }
  }

  return <main className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#090a0c] px-4 py-12 text-white">
    <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/[.035] p-7 shadow-2xl sm:p-10">
      <div className="mb-7 flex items-center justify-between gap-4"><div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><UserRound size={22}/></div><span className="text-xs text-white/45">STEP {step + 1} OF 4</span></div>
      <div className="mb-8 grid grid-cols-4 gap-2" aria-label="Onboarding progress">{[0,1,2,3].map(index => <div key={index} className={`h-1.5 rounded-full ${index <= step ? 'bg-cyan-300' : 'bg-white/10'}`}/>)}</div>
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-white/55"><LoaderCircle size={16} className="animate-spin"/> Loading your profile…</p> : <form onSubmit={complete}>
        {step === 0 && <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-200">Welcome to LeonardX</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Let’s set up your workspace.</h1><p className="mt-3 text-sm leading-6 text-white/60">A few details help Leo shape a more relevant starting experience.</p><label className="mt-7 grid gap-2 text-sm font-medium">What should we call you?<input autoComplete="name" required minLength={2} maxLength={80} value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your full name" className="min-h-12 rounded-xl border border-white/15 bg-black/30 px-4 text-white outline-none focus:border-cyan-300/60"/></label></div>}
        {step === 1 && <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-200">Your role</p><h1 className="mt-3 text-3xl font-bold tracking-tight">What best describes you?</h1><div className="mt-7 grid gap-3 sm:grid-cols-2">{roles.map(([value,label]) => <button key={value} type="button" onClick={() => setRole(value)} className={`rounded-xl border p-4 text-left text-sm ${role === value ? 'border-cyan-300 bg-cyan-300/10 text-white' : 'border-white/10 bg-black/20 text-white/65'}`}>{label}{role === value && <Check size={15} className="float-right text-cyan-200"/>}</button>)}</div></div>}
        {step === 2 && <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-200">Your team</p><h1 className="mt-3 text-3xl font-bold tracking-tight">How large is your team?</h1><div className="mt-7 grid gap-3">{companySizes.map(([value,label]) => <button key={value} type="button" onClick={() => setCompanySize(value)} className={`rounded-xl border p-4 text-left text-sm ${companySize === value ? 'border-cyan-300 bg-cyan-300/10 text-white' : 'border-white/10 bg-black/20 text-white/65'}`}>{label}{companySize === value && <Check size={15} className="float-right text-cyan-200"/>}</button>)}</div></div>}
        {step === 3 && <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-200">Preferences</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Make LeonardX yours.</h1><p className="mt-3 text-sm text-white/60">Choose your default appearance and optional product email preference.</p><div className="mt-7 grid grid-cols-2 gap-3">{(['light','dark'] as const).map(value => <button key={value} type="button" onClick={() => setThemeChoice(value)} className={`rounded-xl border p-5 text-left ${theme === value ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-black/20'}`}>{value === 'light' ? <Sun size={20}/> : <Moon size={20}/>}<span className="mt-3 block text-sm font-semibold capitalize">{value} mode</span></button>)}</div><label className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm text-white/70"><input type="checkbox" checked={emailOptOut} onChange={event => setEmailOptOut(event.target.checked)} className="mt-1 accent-cyan-300"/><span>Opt out of non-essential product and marketing emails. Essential account and security messages may still be sent.</span></label></div>}
        {error && <p role="alert" className="mt-6 text-sm text-red-300">{error}</p>}
        <div className="mt-8 flex items-center justify-between gap-3"><button type="button" disabled={step === 0 || saving} onClick={() => { setError(''); setStep(value => Math.max(0, value - 1)); }} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-white/70 disabled:opacity-30"><ArrowLeft size={16}/> Back</button>{step < 3 ? <button type="button" onClick={nextStep} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-300 px-5 font-semibold text-slate-950">Continue <ArrowRight size={16}/></button> : <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-300 px-5 font-semibold text-slate-950 disabled:opacity-60">{saving ? <><LoaderCircle size={16} className="animate-spin"/> Saving…</> : <>Finish setup <Check size={16}/></>}</button>}</div>
      </form>}
    </section>
  </main>;
}
