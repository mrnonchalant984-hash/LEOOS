'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client-auth';
import { Activity, ArrowLeft, RefreshCw, ShieldAlert, Server, Workflow } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type Monitoring = {
  generated_at: string;
  queue: { sampled_jobs: number; counts: Record<string, number>; oldest_queued_age_seconds: number | null };
  agent_queue?: { available: boolean; sampled_jobs: number; counts: Record<string, number>; oldest_queued_age_seconds: number | null; active_jobs: number; expired_leases: number; retry_attempts_sampled: number; last_successful_completion: string | null };
  workers: Array<{ worker_id: string; status: string; job_id?: string | null; error_code?: string | null; started_at?: string | null; finished_at?: string | null; created_at: string }>;
  worker_enabled: boolean;
  runner_configured: boolean;
  offline_sync_configured: boolean;
};
export default function WorkforceMonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await authFetch('/api/workforce/monitoring', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Workforce monitoring could not be loaded.');
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Monitoring is unavailable.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000); return () => window.clearInterval(timer); }, [refresh]);
  const cards = [
    ['Queued', data?.queue.counts.queued ?? 0], ['Running', data?.queue.counts.running ?? 0], ['Succeeded', data?.queue.counts.succeeded ?? 0], ['Failed', data?.queue.counts.failed ?? 0], ['Blocked', data?.queue.counts.blocked ?? 0], ['Cancelled', data?.queue.counts.cancelled ?? 0],
  ];
  return <LEOAppShell title="Workforce Monitoring" subtitle="Owner-only queue health, worker heartbeats and infrastructure readiness.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><a href="/workforce" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300"><ArrowLeft size={15}/> Workforce dashboard</a><button onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={14} className={busy ? 'animate-spin' : ''}/> Refresh</button></div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <Panel key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></Panel>)}</div>
    <Panel className="mt-4"><div className="flex items-center gap-2"><Activity size={17}/><h2 className="font-semibold">Durable agent queue</h2></div>{!data?.agent_queue?.available ? <p className="mt-3 text-sm text-amber-200">Agent queue diagnostics unavailable. Check whether the agent queue migration is applied.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><p className="text-sm text-zinc-400">Queued: <strong className="text-white">{data.agent_queue.counts.queued ?? 0}</strong></p><p className="text-sm text-zinc-400">Running: <strong className="text-white">{data.agent_queue.active_jobs}</strong></p><p className="text-sm text-zinc-400">Expired leases: <strong className="text-white">{data.agent_queue.expired_leases}</strong></p><p className="text-sm text-zinc-400">Sampled retries: <strong className="text-white">{data.agent_queue.retry_attempts_sampled}</strong></p><p className="text-sm text-zinc-400">Oldest queued age: <strong className="text-white">{data.agent_queue.oldest_queued_age_seconds == null ? 'None' : `${Math.floor(data.agent_queue.oldest_queued_age_seconds / 60)}m ${data.agent_queue.oldest_queued_age_seconds % 60}s`}</strong></p><p className="text-sm text-zinc-400">Last successful completion: <strong className="text-white">{data.agent_queue.last_successful_completion ? new Date(data.agent_queue.last_successful_completion).toLocaleString() : 'None in sample'}</strong></p><p className="text-sm text-zinc-400">Sampled jobs: <strong className="text-white">{data.agent_queue.sampled_jobs}</strong></p></div>}<p className="mt-3 text-[10px] leading-5 text-zinc-600">Operational metadata only; no task prompts or result content is shown. This is a sample of up to 500 jobs and does not prove the scheduler is alive.</p></Panel>
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><Panel><div className="flex items-center gap-2"><Activity size={17}/><h2 className="font-semibold">Queue health</h2></div><p className="mt-3 text-sm text-zinc-400">Sampled jobs: <strong className="text-white">{data?.queue.sampled_jobs ?? '—'}</strong></p><p className="mt-2 text-sm text-zinc-400">Oldest queued job: <strong className="text-white">{data?.queue.oldest_queued_age_seconds == null ? 'None' : `${Math.floor(data.queue.oldest_queued_age_seconds / 60)}m ${data.queue.oldest_queued_age_seconds % 60}s`}</strong></p></Panel><Panel><div className="flex items-center gap-2"><Server size={17}/><h2 className="font-semibold">Worker and runner</h2></div><p className="mt-3 text-sm">Background worker: <span className={data?.worker_enabled ? 'text-emerald-300' : 'text-amber-300'}>{data?.worker_enabled ? 'Enabled by configuration' : 'Not enabled'}</span></p><p className="mt-2 text-sm">Repository runner: <span className={data?.runner_configured ? 'text-emerald-300' : 'text-amber-300'}>{data?.runner_configured ? 'Configured' : 'Not configured'}</span></p><p className="mt-2 text-xs leading-5 text-zinc-500">Configuration flags do not prove that the worker or runner is currently healthy.</p></Panel><Panel><div className="flex items-center gap-2"><Workflow size={17}/><h2 className="font-semibold">Offline outbox</h2></div><p className="mt-3 text-sm text-zinc-400">Sync API: <strong className="text-white">{data?.offline_sync_configured ? 'Configured' : 'Unavailable'}</strong></p><p className="mt-2 text-xs leading-5 text-zinc-500">Local model readiness is configured separately on the computer running LeonardX.</p><a href="/offline" className="mt-3 inline-block text-xs text-[var(--gold)]">Open offline workspace →</a></Panel></div>
    <Panel className="mt-4"><div className="mb-4 flex items-center gap-2"><ShieldAlert size={17}/><h2 className="font-semibold">Recent worker heartbeats</h2></div>{!data?.workers.length ? <p className="py-6 text-center text-sm text-zinc-500">No heartbeat records were returned. A worker may not have run yet, or the required migration may not be applied.</p> : <div className="overflow-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-zinc-500"><tr><th className="p-3">Worker</th><th className="p-3">Status</th><th className="p-3">Job</th><th className="p-3">Error</th><th className="p-3">Last record</th></tr></thead><tbody>{data.workers.map((worker, index) => <tr key={`${worker.worker_id}-${worker.created_at}-${index}`} className="border-t border-white/5"><td className="p-3 font-mono text-xs">{worker.worker_id}</td><td className="p-3"><StatusPill status={worker.status}/></td><td className="p-3 font-mono text-xs">{worker.job_id || '—'}</td><td className="p-3 text-xs text-zinc-400">{worker.error_code || '—'}</td><td className="p-3 text-xs text-zinc-400">{new Date(worker.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}<p className="mt-4 text-[10px] text-zinc-600">Last dashboard sample: {data?.generated_at ? new Date(data.generated_at).toLocaleString() : 'Not loaded'}.</p></Panel>
  </LEOAppShell>;
}
