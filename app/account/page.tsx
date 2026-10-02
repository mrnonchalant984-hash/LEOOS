'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

export default function AccountPage() {
  const [email, setEmail] = useState('');
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setLoading(false); return; }
    const supabase = createBrowserClient(url, key);
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      setEmail(data.user.email || '');
      const { data: s } = await supabase.from('subscriptions').select('*').eq('user_id', data.user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
      setSub(s);
      setLoading(false);
    });
  }, []);

  async function logout() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-16"><p className="text-zinc-400">Loading your account…</p></main>;

  return <main className="mx-auto max-w-5xl px-4 py-16">
    <h1 className="text-4xl font-black">Your LEO account</h1>
    <p className="mt-2 text-zinc-400">{email || 'You are browsing as a guest.'}</p>
    {email ? <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-xl font-bold">Current access</h2>
      <p className="mt-3 text-zinc-400">{sub ? `${sub.plan} • ${sub.billing_period} • active until ${new Date(sub.ends_at).toLocaleDateString()}` : 'No active paid subscription. Free LEO features remain available.'}</p>
      <p className="mt-4 text-sm text-green-400">✓ Your login session is remembered on this device when you close and reopen the site.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link href="/dashboard" className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Open dashboard</Link><Link href="/pricing" className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">View plans</Link><button onClick={logout} className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">Log out</button></div>
    </div> : <Link href="/auth" className="mt-6 inline-block rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Log in or create an account</Link>}
  </main>;
}
