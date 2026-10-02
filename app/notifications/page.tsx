"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { GlassCard } from '@/components/GlassCard';

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const supabase = createBrowserClient(url, key);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/auth';
        return;
      }

      const r = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await r.json();

      if (r.ok) {
        setItems(json.notifications || []);
      } else {
        alert(json.error || 'Notifications could not be loaded.');
      }
      setLoading(false);
    })();
  }, []);

  async function markAllRead() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserClient(url, key);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const r = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mark: 'all' }),
    });

    if (r.ok) {
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-300">PERSONAL</p>
          <h1 className="mt-2 text-4xl font-black">Notifications</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="rounded-full border border-white/10 px-4 py-2 text-sm">Dashboard</Link>
          <button onClick={markAllRead} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-black">Mark all read</button>
        </div>
      </div>

      <GlassCard className="p-6">
        {loading ? (
          <p className="text-zinc-400">Loading notifications…</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-400">You are all caught up.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className={`rounded-2xl border p-4 ${item.read ? 'border-white/10 bg-white/[0.02]' : 'border-yellow-400/30 bg-yellow-400/5'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{item.title}</p>
                  {!item.read && <span className="rounded-full bg-yellow-400/20 px-2 py-1 text-[10px] font-bold uppercase text-yellow-300">New</span>}
                </div>
                <p className="mt-2 text-zinc-300">{item.body}</p>
                <p className="mt-2 text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </main>
  );
}
