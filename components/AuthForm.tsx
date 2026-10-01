'use client';
import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('Working…');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Authentication failed.');
      if (result.session) {
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { error } = await supabase.auth.setSession(result.session);
        if (error) throw error;
        setStatus(mode === 'login' ? 'Signed in. Your session will be remembered on this device.' : 'Account created and signed in.');
        window.location.assign('/account');
      } else {
        setStatus(result.message || 'Account created. Check your email to confirm it, then log in.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mx-auto max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
    <h1 className="text-3xl font-black">{mode === 'login' ? 'Log in to LEO' : 'Create your LEO account'}</h1>
    <p className="mt-2 text-sm text-zinc-500">You can browse the website and use public pages without an account. Account creation is only needed when you choose to use account features.</p>
    <div className="mt-6 grid gap-4">
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="Email" className="rounded-xl border border-zinc-800 bg-black px-4 py-3"/>
      <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Password (8+ characters)" className="rounded-xl border border-zinc-800 bg-black px-4 py-3"/>
      <button disabled={busy} className="rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
    </div>
    {status && <p className="mt-4 text-sm text-zinc-400">{status}</p>}
    <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="mt-5 text-sm text-yellow-300">{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}</button>
  </form>
}
