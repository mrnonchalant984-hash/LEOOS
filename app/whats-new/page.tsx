"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { GlassCard } from '@/components/GlassCard';

export default function WhatsNewPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const supabase = createBrowserClient(url, key);
      const { data: { session } } = await supabase.auth.getSession();

      const r = await fetch('/api/whats-new', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await r.json();

      if (r.ok) {
        setItems(json.announcements || []);
      }
      setLoading(false);
    })();
  }, []);

  async function markSeen(id: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserClient(url, key);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch('/api/whats-new', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ announcement_id: id }),
    });

    setItems((current) => current.map((item) => (item.id === id ? { ...item, seen: true } : item)));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-300">LATEST</p>
          <h1 className="mt-2 text-4xl font-black">What&apos;s new</h1>
        </div>
        <Link href="/dashboard" className="rounded-full border border-white/10 px-4 py-2 text-sm">Dashboard</Link>
      </div>

      <div className="space-y-5">
        {loading ? (
          <p className="text-zinc-400">Loading releases…</p>
        ) : items.length === 0 ? (
          <GlassCard className="p-6">
            <p className="text-zinc-400">No published announcements yet.</p>
          </GlassCard>
        ) : (
          items.map((item) => (
            <GlassCard key={item.id} className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-yellow-300">{item.version || 'Release'}</p>
                  <h2 className="mt-1 text-3xl font-black">{item.title}</h2>
                </div>
                {!item.seen && (
                  <button onClick={() => markSeen(item.id)} className="rounded-full bg-yellow-400 px-3 py-2 text-xs font-bold text-black">Mark as seen</button>
                )}
              </div>
              <p className="mt-4 text-zinc-300">{item.summary || item.description}</p>
              {item.feature_list && item.feature_list.length > 0 && (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-zinc-300">
                  {item.feature_list.map((feature: string) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              )}
              {item.cta_url && (
                <a href={item.cta_url} className="mt-5 inline-flex rounded-full bg-yellow-400 px-4 py-2 font-bold text-black">
                  {item.cta || 'View details'}
                </a>
              )}
            </GlassCard>
          ))
        )}
      </div>
    </main>
  );
}
