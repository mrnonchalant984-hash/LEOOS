"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowRight, Bell, BookOpen, FolderKanban, Globe2, MessageSquare, Sparkles, LayoutDashboard, Wand2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

type DashboardData = {
  user: { name: string; email: string };
  plan: string;
  status: string;
  billingPeriod: string | null;
  credits: number | string;
  counts: { conversations: number; memories: number; projects: number; websites: number; unreadNotifications: number };
  conversations: { id: string; title: string | null; updated_at: string }[];
  projects: { id: string; project_name: string; type: string | null; status: string | null; created_at: string }[];
  websites: { id: string; business_name: string | null; website_type: string; status: string; live_url: string | null; updated_at: string }[];
  notifications: { id: string; title: string; body: string; created_at: string }[];
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        setError('Account services are not configured.');
        return;
      }
      const supabase = createBrowserClient(url, key);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.assign('/auth');
        return;
      }
      const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        if (active) setError(result.error || 'Dashboard data could not be loaded.');
        return;
      }
      if (active) setData(result as DashboardData);
    })().catch(() => {
      if (active) setError('Dashboard data could not be loaded. Please refresh and try again.');
    });
    return () => { active = false; };
  }, []);

  if (error) {
    return <main className="mx-auto max-w-7xl px-4 py-12"><p role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-200">{error}</p></main>;
  }

  if (!data) {
    return <main className="mx-auto max-w-7xl px-4 py-12"><p className="text-zinc-400">Loading your workspace…</p></main>;
  }

  const metrics = [
    ['Conversations', data.counts.conversations, MessageSquare, '/app'],
    ['Saved memories', data.counts.memories, BookOpen, '/app'],
    ['Projects', data.counts.projects, FolderKanban, '/projects'],
    ['Websites', data.counts.websites, Globe2, '/setup'],
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-yellow-300">YOUR LEO WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Good evening, {data.user.name} 👋</h1>
          <p className="mt-2 text-zinc-400">Your recent work, personal projects, and account activity at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/app" className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black">Ask Leo <ArrowRight size={17} /></Link>
          <Link href="/whats-new" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-semibold text-white">What&apos;s New</Link>
        </div>
      </header>

      <section aria-label="Account overview" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, Icon, href]) => (
          <Link key={label} href={href} className="block">
            <GlassCard className="h-full p-5">
              <Icon size={19} className="text-yellow-300" />
              <p className="mt-4 text-sm text-zinc-400">{label}</p>
              <p className="mt-1 text-3xl font-black">{value}</p>
            </GlassCard>
          </Link>
        ))}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Recent conversations</h2>
            <Link href="/app" className="text-sm text-yellow-300">Open Leo</Link>
          </div>
          {data.conversations.length ? (
            <ul className="mt-4 divide-y divide-white/10">
              {data.conversations.map(chat => (
                <li key={chat.id} className="py-3">
                  <Link href="/app" className="flex items-center justify-between gap-4">
                    <span className="truncate">{chat.title || 'New conversation'}</span>
                    <time className="shrink-0 text-xs text-zinc-500">{new Date(chat.updated_at).toLocaleDateString()}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">No saved conversations yet. Start a conversation with Leo.</p>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={19} className="text-yellow-300" />
            <h2 className="text-xl font-bold">Account access</h2>
          </div>
          <p className="mt-4 text-2xl font-black">{data.plan}</p>
          <p className="mt-1 text-sm text-zinc-400">{data.status === 'owner' ? 'Owner access' : data.billingPeriod ? `${data.billingPeriod} subscription` : 'Free account'}</p>
          <p className="mt-4 text-sm text-zinc-300">Credits available: <b>{data.credits}</b></p>
          <Link href="/pricing" className="mt-5 inline-flex items-center gap-2 text-sm text-yellow-300">View plans <ArrowRight size={15} /></Link>
        </GlassCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">My projects</h2>
            <Link href="/projects" className="text-sm text-yellow-300">Browse</Link>
          </div>
          {data.projects.length ? (
            <ul className="mt-4 space-y-3">
              {data.projects.map(project => (
                <li key={project.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{project.project_name}</p>
                    <p className="text-xs text-zinc-500">{project.type || 'Project'} · {project.status || 'draft'}</p>
                  </div>
                  <time className="shrink-0 text-xs text-zinc-500">{new Date(project.created_at).toLocaleDateString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">No projects yet.</p>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">My websites</h2>
            <Link href="/setup" className="text-sm text-yellow-300">Start a website</Link>
          </div>
          {data.websites.length ? (
            <ul className="mt-4 space-y-3">
              {data.websites.map(website => (
                <li key={website.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{website.business_name || website.website_type}</p>
                    <p className="text-xs text-zinc-500">{website.website_type} · {website.status}</p>
                  </div>
                  {website.live_url ? (
                    <a href={website.live_url} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-yellow-300">Open site</a>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-500">Not live</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">No website projects yet.</p>
          )}
        </GlassCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-yellow-300" />
              <h2 className="text-xl font-bold">Notifications</h2>
            </div>
            <Link href="/notifications" className="text-sm text-yellow-300">View all</Link>
          </div>
          {data.notifications.length ? (
            <ul className="mt-4 space-y-3">
              {data.notifications.map(notification => (
                <li key={notification.id} className="rounded-xl border border-white/10 p-3">
                  <p className="font-semibold">{notification.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{notification.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">You’re all caught up.</p>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-yellow-300" />
            <h2 className="text-xl font-bold">Quick actions</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm text-zinc-200">
            <Link href="/app" className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><MessageSquare size={16} className="text-yellow-300" /> Continue conversation</Link>
            <Link href="/projects" className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><FolderKanban size={16} className="text-yellow-300" /> Review my projects</Link>
            <Link href="/setup" className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><Globe2 size={16} className="text-yellow-300" /> Manage websites</Link>
            <Link href="/dashboard" className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><LayoutDashboard size={16} className="text-yellow-300" /> Personal overview</Link>
          </div>
        </GlassCard>
      </section>
    </main>
  );
}
