"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { GlassCard } from '@/components/GlassCard';

export default function UpgradeHistoryPage() {
  const [jobs, setJobs] = useState<any[]>([]);

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

      const r = await fetch('/api/admin/upgrade-history', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await r.json();

      if (r.ok) {
        setJobs(json.jobs || []);
      } else {
        alert(json.error || 'Unable to load upgrade history.');
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-300">OWNER</p>
          <h1 className="mt-2 text-4xl font-black">Upgrade history</h1>
        </div>
        <Link href="/admin" className="rounded-full border border-white/10 px-4 py-2 text-sm">← Admin</Link>
      </div>

      <GlassCard className="p-6">
        {jobs.length === 0 ? (
          <p className="text-zinc-400">No upgrade jobs yet.</p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-yellow-300">{job.status}</p>
                    <h2 className="text-xl font-bold">{job.request}</h2>
                  </div>
                  <span className="text-xs text-zinc-400">{new Date(job.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                  <p>Repository: {job.repository || 'Unspecified'}</p>
                  <p>Branch: {job.branch || 'main'}</p>
                  <p>Files changed: {job.files_changed || 0}</p>
                  <p>Commit: {job.commit_sha || 'Not available'}</p>
                  <p>Deployment: {job.deployment_url || 'Not deployed'}</p>
                  <p>Status: {job.status}</p>
                </div>
                {job.error_message ? <p className="mt-3 text-sm text-red-300">{job.error_message}</p> : null}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </main>
  );
}
