'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPlanDisplayName } from '@/lib/pricing';

export default function AccountPage() {
  const router = useRouter();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [email, setEmail] = useState('');
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(url && key));

  useEffect(() => {
    if (!url || !key) return;
    let active = true;
    const supabase = createBrowserClient(url, key);
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !data.user) { setLoading(false); return; }
      setEmail(data.user.email || '');
      const { data: subscription } = await supabase.from('subscriptions').select('*')
        .eq('user_id', data.user.id).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      const endsAt = subscription?.ends_at || subscription?.current_period_end;
      setSub(subscription ? { ...subscription, expired: Boolean(endsAt && new Date(endsAt) <= new Date()) } : null);
      setLoading(false);
    })().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key, url]);

  async function logout() {
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-16"><p className="text-zinc-400">Loading your account…</p></main>;

  return <main className="mx-auto max-w-5xl px-4 py-16">
    <h1 className="text-4xl font-black">Your LEO account</h1>
    <p className="mt-2 text-zinc-400">{email || 'You are browsing as a guest.'}</p>
    {email ? <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-xl font-bold">Current access</h2>
      <p className="mt-3 text-zinc-400">{sub ? `${getPlanDisplayName(sub.plan)} • ${sub.expired ? 'expired' : 'access through'} ${new Date(sub.ends_at || sub.current_period_end).toLocaleDateString()}` : 'No active paid subscription. Free LEO features remain available.'}</p>
      <p className="mt-3 text-sm text-zinc-500">Plans are prepaid for the selected period and do not automatically renew. Purchase another period to continue paid access.</p>
      <p className="mt-4 text-sm text-green-400">✓ Your login session is remembered on this device when you close and reopen the site.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link href="/dashboard" className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Open dashboard</Link><Link href="/pricing" className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">View plans</Link><button onClick={logout} className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">Log out</button></div>
    </div> : <Link href="/auth" className="mt-6 inline-block rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Log in or create an account</Link>}
  </main>;
}
