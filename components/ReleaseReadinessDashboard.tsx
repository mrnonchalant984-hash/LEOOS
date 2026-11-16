'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import {
  Activity, AlertTriangle, Clipboard, Code2, Database,
  ExternalLink, Eye, Gauge, GitBranch, Image as ImageIcon, LockKeyhole,
  RefreshCw, ShieldCheck, Terminal, Workflow,
} from 'lucide-react';

type Environment = {
  supabaseUrl: boolean; supabaseServiceRole: boolean; geminiKey: boolean;
  vercelToken: boolean; githubCredential: boolean; workflowWorkerEnabled: boolean;
  workflowWorkerSecret: boolean; workspaceRuntimeProvider: string; workspaceRuntimeRepository: boolean;
  imageModel: string; audioModel: string;
};
type ReadinessResponse = { generatedAt: string; environment: Environment; note: string };

const gates = [
  { title: 'Build & deployment diagnostics', detail: 'Correlate request IDs, inspect GitHub/Vercel permissions and confirm deployment READY state.', icon: GitBranch, status: 'Staging reproduction required', href: '/deployments' },
  { title: 'Background workflow recovery', detail: 'Verify soft-deadline yielding, persisted checkpoints, retries, cancellation and dead-letter handling.', icon: Workflow, status: 'Worker resume test required', href: '/workforce/monitoring' },
  { title: 'LeoCode runtime', detail: 'Launch the VS Code Extension Development Host and test activation, approval gates, workspace edits and terminal boundaries.', icon: Code2, status: 'Interactive VS Code test required', href: '/dashboard/leocode-access' },
  { title: 'Work GitHub Actions runtime', detail: 'Verify the private LEOOS-RUNTIME repository, signed workspace hand-off, Actions permissions, ephemeral runner and secret isolation.', icon: LockKeyhole, status: 'Private repository setup and live job test required', href: '/docs' },
  { title: 'Supabase & RLS', detail: 'Run the read-only policy audit, then prove two-tenant row and storage isolation with disposable accounts.', icon: Database, status: 'Remote staging test required', href: '/status' },
  { title: 'Gemini image & voice', detail: 'Run the opt-in provider smoke test, then verify authenticated image upload, vision, recording, transcription and playback.', icon: ImageIcon, status: 'Live provider test required', href: '/app' },
  { title: 'TypeScript & production build', detail: 'Install the lockfile dependencies, run typecheck, lint, the full test suite and a clean production build.', icon: Terminal, status: 'Laptop verification required', href: '/docs' },
  { title: 'Responsive browser QA', detail: 'Review the generated desktop/tablet/mobile screenshots, console errors, page errors and horizontal overflow.', icon: Eye, status: 'Browser review required', href: '/status' },
];

const commands = [
  { label: 'TypeScript', value: 'npm run typecheck' },
  { label: 'Tests', value: 'npm test' },
  { label: 'Lint', value: 'npm run lint' },
  { label: 'Production build', value: 'npm run build' },
  { label: 'Workflow diagnostics', value: 'npm run diagnose:workflows' },
  { label: 'LeoCode preflight', value: 'npm run verify:leocode' },
  { label: 'Responsive browser QA', value: 'npm run test:visual -- --base-url http://127.0.0.1:3000' },
];

function ConfigItem({ label, configured }: { label: string; configured: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/[.06] py-2.5 last:border-0">
    <span className="text-sm text-zinc-300">{label}</span>
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${configured ? 'border-emerald-400/20 bg-emerald-400/[.06] text-emerald-300' : 'border-amber-400/20 bg-amber-400/[.06] text-amber-200'}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-emerald-300' : 'bg-amber-300'}`} />{configured ? 'Detected' : 'Missing'}
    </span>
  </div>;
}

export function ReleaseReadinessDashboard() {
  const router = useRouter();
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Supabase browser configuration is missing.');
      const client = createBrowserClient(url, key);
      const { data: { session } } = await client.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      const response = await fetch('/api/admin/release-readiness', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const result = await response.json();
      if (response.status === 403) throw new Error(result.error || 'Owner 2FA access is required for this page.');
      if (!response.ok) throw new Error(result.error || 'Readiness configuration could not be loaded.');
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Readiness configuration could not be loaded.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1800); }
    catch { setCopied('Clipboard unavailable'); }
  };

  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-3xl border border-[var(--gold)]/20 bg-[radial-gradient(circle_at_85%_10%,rgba(208,177,112,.15),transparent_35%),linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.02))] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><span className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--gold)]">Owner operations / release gate</span><h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Production readiness, with evidence.</h2><p className="mt-2 text-sm leading-6 text-zinc-400">A single place to coordinate the remaining checks. Nothing is marked passed merely because a variable exists or a script is present.</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-[var(--gold)]/30 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh environment</button>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Release status</p><p className="mt-1 text-lg font-bold text-amber-200">Verification pending</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Acceptance gates</p><p className="mt-1 text-lg font-bold text-white">{gates.length} outstanding</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Environment snapshot</p><p className="mt-1 text-sm font-semibold text-white">{data ? new Date(data.generatedAt).toLocaleString() : loading ? 'Loading…' : 'Unavailable'}</p></div>
      </div>
    </section>

    {error && <div role="alert" className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-sm text-amber-100"><div className="flex items-start gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0"/><div><p className="font-semibold">Readiness access unavailable</p><p className="mt-1 text-xs leading-5 text-amber-100/70">{error}</p></div></div></div>}

    <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold text-white">Release acceptance gates</h3><p className="mt-1 text-xs text-zinc-500">All statuses below require actual staging or laptop evidence.</p></div><ShieldCheck size={18} className="text-[var(--gold)]"/></div>
        <div className="space-y-2">{gates.map((gate, index) => { const Icon = gate.icon; return <article key={gate.title} className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-black/15 p-3 sm:p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--gold)]/15 bg-[var(--gold)]/[.06] text-[var(--gold)]"><Icon size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-zinc-100">{String(index + 1).padStart(2, '0')} · {gate.title}</h4><span className="rounded-full border border-amber-300/15 bg-amber-300/[.05] px-2 py-0.5 text-[9px] font-semibold text-amber-100">{gate.status}</span></div><p className="mt-1 text-xs leading-5 text-zinc-500">{gate.detail}</p><Link href={gate.href} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--gold)] hover:underline">Open related workspace <ExternalLink size={11}/></Link></div></article>; })}</div>
      </section>

      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2"><Activity size={17} className="text-[var(--gold)]"/><h3 className="text-sm font-bold text-white">Server configuration presence</h3></div>
          {loading && !data ? <p className="text-xs text-zinc-500">Reading safe configuration indicators…</p> : data ? <>
            <ConfigItem label="Supabase project URL" configured={data.environment.supabaseUrl}/>
            <ConfigItem label="Supabase service role" configured={data.environment.supabaseServiceRole}/>
            <ConfigItem label="Gemini API key" configured={data.environment.geminiKey}/>
            <ConfigItem label="Vercel token" configured={data.environment.vercelToken}/>
            <ConfigItem label="GitHub credential" configured={data.environment.githubCredential}/>
            <ConfigItem label="Workflow worker enabled" configured={data.environment.workflowWorkerEnabled}/>
            <ConfigItem label="Workflow worker secret" configured={data.environment.workflowWorkerSecret}/>
            <ConfigItem label="Workspace runtime repository" configured={data.environment.workspaceRuntimeRepository}/>
            <div className="mt-3 rounded-xl border border-white/[.06] bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Configured model defaults</p><p className="mt-1 text-xs text-zinc-200">Image: {data.environment.imageModel}</p><p className="mt-1 text-xs text-zinc-200">Audio: {data.environment.audioModel}</p></div>
          </> : <p className="text-xs text-zinc-500">Configuration indicators are not available.</p>}
          <p className="mt-3 text-[10px] leading-4 text-zinc-600">Presence only. This panel never displays secret values and does not test connectivity, permissions, provider quota or tenant isolation.</p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2"><Gauge size={17} className="text-[var(--gold)]"/><h3 className="text-sm font-bold text-white">Local verification commands</h3></div>
          <div className="space-y-2">{commands.map(command => <div key={command.label} className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-black/20 px-3 py-2"><div className="min-w-0 flex-1"><p className="text-[10px] text-zinc-500">{command.label}</p><code className="block truncate text-[11px] text-zinc-200">{command.value}</code></div><button type="button" onClick={() => void copy(command.value, command.label)} aria-label={`Copy ${command.label} command`} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><Clipboard size={14}/></button></div>)}</div>
          <p role="status" aria-live="polite" className="mt-2 min-h-4 text-[10px] text-emerald-300">{copied}</p>
        </section>
      </div>
    </div>
    <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.035] p-4"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-200"/><div><p className="text-xs font-semibold text-amber-100">Do not deploy from this page.</p><p className="mt-1 text-xs leading-5 text-zinc-400">This is a read-only release checklist. Install dependencies and run the checks locally first. Complete live provider, RLS, sandbox and VS Code tests against staging before treating any gate as passed.</p></div></div></div>
  </div>;
}
