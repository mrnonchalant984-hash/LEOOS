"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { GlassCard } from '@/components/GlassCard';

type Announcement = {
  id: string;
  title: string;
  version?: string | null;
  summary?: string | null;
  description: string;
  feature_list?: string[];
  cta?: string | null;
  cta_url?: string | null;
  status: string;
  release_date?: string | null;
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: '',
    version: 'v5.0',
    summary: '',
    description: '',
    feature_list: '',
    cta: "Explore What's New",
    cta_url: '/whats-new',
    status: 'draft',
    release_date: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  async function getSession() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const supabase = createBrowserClient(url, key);
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  async function loadAnnouncements() {
    const session = await getSession();
    if (!session) {
      window.location.href = '/auth';
      return;
    }

    const r = await fetch('/api/admin/announcements', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await r.json();

    if (!r.ok) {
      alert(json.error || 'Unable to load announcements.');
      return;
    }

    setAnnouncements(json.announcements || []);
    setLoading(false);
  }

  async function saveAnnouncement() {
    const session = await getSession();
    if (!session) return;

    const payload = {
      ...form,
      feature_list: form.feature_list
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      release_date: form.release_date ? new Date(form.release_date).toISOString() : null,
    };

    const r = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await r.json();

    if (!r.ok) {
      alert(json.error || 'Announcement could not be saved.');
      return;
    }

    setForm({
      title: '',
      version: 'v5.0',
      summary: '',
      description: '',
      feature_list: '',
      cta: "Explore What's New",
      cta_url: '/whats-new',
      status: 'draft',
      release_date: new Date().toISOString().slice(0, 16),
    });

    await loadAnnouncements();
  }

  async function togglePublish(id: string, status: string) {
    const session = await getSession();
    if (!session) return;

    const r = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, status: status === 'published' ? 'draft' : 'published' }),
    });
    const json = await r.json();

    if (!r.ok) {
      alert(json.error || 'Status update failed.');
      return;
    }

    await loadAnnouncements();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-300">OWNER</p>
          <h1 className="mt-2 text-4xl font-black">Announcements</h1>
        </div>
        <Link href="/admin" className="rounded-full border border-white/10 px-4 py-2 text-sm">← Admin</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        <GlassCard className="p-6">
          <h2 className="text-xl font-bold">Create announcement</h2>
          <div className="mt-5 space-y-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Title" />
            <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Version" />
            <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Summary" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Description" />
            <input value={form.feature_list} onChange={(e) => setForm({ ...form, feature_list: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Feature list, comma separated" />
            <input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="CTA label" />
            <input value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" placeholder="CTA URL" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="datetime-local" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 p-3">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <button onClick={saveAnnouncement} className="w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black">Save announcement</button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="text-xl font-bold">Published and draft announcements</h2>
          {loading ? (
            <p className="mt-4 text-zinc-400">Loading…</p>
          ) : announcements.length === 0 ? (
            <p className="mt-4 text-zinc-400">No announcements yet.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {announcements.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-yellow-300">{item.version || 'Announcement'}</p>
                      <h3 className="mt-1 text-xl font-bold">{item.title}</h3>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-300">{item.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-300">{item.summary || item.description}</p>
                  {item.feature_list && item.feature_list.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-400">
                      {item.feature_list.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => togglePublish(item.id, item.status)} className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-200">
                      {item.status === 'published' ? 'Move to draft' : 'Publish'}
                    </button>
                    {item.cta_url && (
                      <a href={item.cta_url} className="rounded-full border border-yellow-400/40 px-3 py-2 text-xs text-yellow-300">
                        {item.cta || 'Open'}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
