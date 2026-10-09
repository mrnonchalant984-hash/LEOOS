'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'reset' || window.location.hash.includes('type=recovery')) setMode('reset');
  }, []);

  function changeMode(next: Mode) { setMode(next); setStatus(''); setStatusError(false); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(''); setStatusError(false);
    if ((mode === 'signup' || mode === 'reset') && password !== confirmPassword) { setStatus('Your passwords do not match.'); setStatusError(true); return; }
    if ((mode === 'signup' || mode === 'reset') && password.length < 8) { setStatus('Use at least 8 characters for your password.'); setStatusError(true); return; }
    setBusy(true);
    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Authentication is not configured yet. Please contact the platform owner.');
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?mode=reset` });
        if (error) throw error;
        setStatus('If an account exists for this email, Supabase will send password recovery instructions. Check your inbox.');
        return;
      }
      if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setStatus('Your password has been updated. You can now sign in with the new password.');
        setMode('login');
        setPassword(''); setConfirmPassword('');
        return;
      }
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const payload = mode === 'login' ? { email, password } : { email, password, full_name: fullName.trim() };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Authentication failed. Please try again.');
      if (result.session) {
        const { error } = await supabase.auth.setSession(result.session);
        if (error) throw error;
        setStatus(mode === 'login' ? 'Signed in successfully. Redirecting to your workspace…' : 'Account created. Redirecting to your workspace…');
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.assign(next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard');
      } else {
        setStatus(result.message || 'Your account request was received. Check your email for any required confirmation steps.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
      setStatusError(true);
    } finally { setBusy(false); }
  }

  const title = mode === 'login' ? 'Welcome back.' : mode === 'signup' ? 'Create your workspace.' : mode === 'reset' ? 'Set a new password.' : 'Recover your account.';
  const description = mode === 'login' ? 'Sign in to continue building with LeonardX.' : mode === 'signup' ? 'One account for your projects, builds, deployments, and Leo workspace.' : mode === 'reset' ? 'Choose a new password for your LeonardX account.' : 'Enter your account email and we’ll request password recovery instructions.';

  return <section className="auth-shell mx-auto max-w-6xl">
    <div className="auth-story"><div className="auth-brand-lockup"><span className="auth-brand-mark">LX</span><span>LEONARDX<small>SOFTWARE CREATION PLATFORM</small></span></div><p className="auth-story-kicker">YOUR WORKSPACE, CONNECTED</p><h2>From first idea<br/>to <span>real software.</span></h2><p>Keep projects, AI-assisted work, builds, integrations, and deployments connected in one workspace.</p><div className="auth-flow"><span>IDEA</span><i>—</i><span>BUILD</span><i>—</i><span>TEST</span><i>—</i><span>DEPLOY</span></div><div className="auth-visual" aria-hidden="true"><div className="auth-visual-window window-back"><div/><div/><div/><div/></div><div className="auth-visual-laptop"><div className="laptop-screen"><div className="laptop-topline"><i/><i/><i/><span>workspace.tsx</span></div><div className="laptop-code"><b/><b/><i/><b/><i/><i/><b/></div><div className="laptop-terminal"><span/> checks complete</div></div><div className="laptop-base"/></div><div className="auth-visual-server"><i/><i/><i/><i/><i/><i/></div><div className="auth-visual-orbit orbit-a"/><div className="auth-visual-orbit orbit-b"/></div><p className="auth-story-foot">Designed for builders. Grounded in real workflows.</p></div>
    <form onSubmit={submit} className="auth-surface mx-auto rounded-3xl border p-6 sm:p-9">
      <div className="auth-form-top"><span className="auth-form-icon"><LockKeyhole size={17}/></span><span className="auth-form-caption">SECURE ACCOUNT ACCESS</span></div>
      <h1 className="mt-5 text-3xl font-black tracking-tight">{title}</h1><p className="mt-3 text-sm leading-7 text-zinc-400">{description}</p>
      <div className="mt-7 grid gap-4">
        {mode === 'signup' && <label className="auth-field"><span>Full name</span><div><UserRound size={16}/><input value={fullName} onChange={event => setFullName(event.target.value)} type="text" autoComplete="name" placeholder="Your name" minLength={2} required/></div></label>}
        <label className="auth-field"><span>Email address</span><div><Mail size={16}/><input value={email} onChange={event => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="you@example.com"/></div></label>
        {mode !== 'forgot' && <label className="auth-field"><span>Password</span><div><LockKeyhole size={16}/><input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'}/><button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
        {(mode === 'signup' || mode === 'reset') && <label className="auth-field"><span>Confirm password</span><div><LockKeyhole size={16}/><input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="Enter your password again"/></div></label>}
        {mode === 'login' && <div className="auth-inline-links"><span>Use your registered account credentials.</span><button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button></div>}
        <button disabled={busy} className="auth-submit" type="submit">{busy ? <><LoaderCircle size={16} className="auth-spinner"/> Please wait…</> : <>{mode === 'login' ? 'Sign in to LeonardX' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Update password' : 'Request recovery email'} <ArrowRight size={16}/></>}</button>
      </div>
      {status && <p role={statusError ? 'alert' : 'status'} className={`auth-status ${statusError ? 'error' : ''}`}>{status}</p>}
      <div className="auth-switch">{mode === 'login' ? <>New to LeonardX? <button type="button" onClick={() => changeMode('signup')}>Create an account</button></> : mode === 'signup' ? <>Already have an account? <button type="button" onClick={() => changeMode('login')}>Sign in</button></> : <>Remembered your password? <button type="button" onClick={() => changeMode('login')}>Return to sign in</button></>}</div>
      <p className="auth-legal">By continuing, you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
    </form>
  </section>;
}
