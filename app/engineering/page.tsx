'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { LEOAppShell } from '@/components/LEOAppShell';
import { DiscoveryWizard } from '@/components/engineering/DiscoveryWizard';
import { AlternativesExplorer } from '@/components/engineering/AlternativesExplorer';
import { EngineeringBuildDashboard } from '@/components/engineering/EngineeringBuildDashboard';
import { LivePreviewFrame } from '@/components/engineering/LivePreviewFrame';
import { EnvConfigPanel } from '@/components/engineering/EnvConfigPanel';
import type { EngineeringWorkflow } from '@/lib/engineering-workflow';
import type { ProjectStrategy } from '@/lib/project-discovery';
import { overallProgress } from '@/lib/engineering-workflow';

type WorkflowView = EngineeringWorkflow & {
  progress?: ReturnType<typeof overallProgress>;
};

export default function EngineeringWorkspacePage() {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<WorkflowView | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; stage: string | null; event_type: string; message: string; created_at: string }>>([]);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [vercelProjectId, setVercelProjectId] = useState('');
  const [vercelProjects, setVercelProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [vercelMessage, setVercelMessage] = useState('');
  const [migrationInfo, setMigrationInfo] = useState<{ count: number; message: string } | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      router.replace(`/auth?next=${encodeURIComponent('/engineering')}`);
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [router]);

  async function refreshWorkflow(id: string) {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/engineering/workflows/${id}`, { headers, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Workflow could not be loaded.');
    setWorkflow(result.workflow);
    setEvents(result.events || []);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch('/api/engineering/workflows?limit=1', { headers, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Workflows could not be loaded.');
        if (!alive) return;
        const latest = result.workflows?.[0];
        if (latest) {
          setWorkflow(latest);
          await refreshWorkflow(latest.id);
        }
        const migrations = await fetch('/api/engineering/migrations/status', { headers, cache: 'no-store' });
        if (migrations.ok) {
          const migrationResult = await migrations.json();
          if (alive) setMigrationInfo({ count: migrationResult.count, message: migrationResult.message });
        }
        const vercel = await fetch('/api/engineering/vercel/projects', { headers, cache: 'no-store' });
        const vercelResult = await vercel.json().catch(() => ({}));
        if (alive) {
          if (vercel.ok) {
            setVercelProjects(vercelResult.projects || []);
            setVercelMessage(vercelResult.note || '');
          } else {
            setVercelMessage(vercelResult.error || 'Vercel project discovery unavailable.');
          }
        }
        setPreviewUrl(window.location.origin);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Engineering workspace unavailable.');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders]);

  async function onStrategyApproved(payload: { answers: Record<string, unknown>; strategy: ProjectStrategy }) {
    setError('');
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch('/api/engineering/workflows', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(payload.answers.productSummary || 'LeonardX engineering workflow').slice(0, 160),
          mode: payload.answers.mode === 'autonomous' ? 'autonomous' : 'discovery',
          budgetTier: payload.answers.budgetTier,
          budgetAmount: payload.answers.budgetAmount,
          budgetCurrency: payload.answers.budgetCurrency,
          summary: payload.strategy.productObjectives.join(' · '),
          strategy: payload.strategy,
          applicability: {
            hasRepository: payload.answers.hasExistingRepo === true,
            needsDatabase: true,
            needsMigrations: false,
            needsDeployment: true,
            needsEnvironmentConfig: true,
            needsIntegrations: true,
            requiresUserApproval: true,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Workflow could not be created.');
      setWorkflow(result.workflow);
      await refreshWorkflow(result.workflow.id);

      // Mark strategy approval as completed and move planning to waiting/running.
      await fetch(`/api/engineering/workflows/${result.workflow.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: 'REQUIREMENTS_DISCOVERY',
          status: 'COMPLETED',
          progressMessage: 'Discovery answers captured and strategy approved.',
        }),
      });
      await fetch(`/api/engineering/workflows/${result.workflow.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: 'PROJECT_STRATEGY',
          status: 'COMPLETED',
          progressMessage: 'Strategy approved by the user.',
          artifacts: { approved: true },
        }),
      });
      await fetch(`/api/engineering/workflows/${result.workflow.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: 'USER_APPROVAL_WHEN_REQUIRED',
          status: 'COMPLETED',
          progressMessage: 'User approved the project strategy.',
        }),
      });
      await fetch(`/api/engineering/workflows/${result.workflow.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: 'IMPLEMENTATION_PLANNING',
          status: 'RUNNING',
          progressMessage: 'Implementation planning is active in the engineering workspace.',
        }),
      });
      await refreshWorkflow(result.workflow.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workflow could not be created.');
    }
  }

  return (
    <LEOAppShell title="Engineering workspace" subtitle="Discover, configure, preview, and ship with durable workflow state">
      <div className="mx-auto grid max-w-7xl gap-6 px-1 pb-16">
        <header className="rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_20%_0%,rgba(212,175,55,.12),transparent_45%),linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015))] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--gold-bright)]">LeonardX autonomous engineering</p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Visual build intelligence</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Progress comes from persisted workflow events. Concept images, implemented UI, live previews, and production deployments are kept distinct.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/setup" className="rounded-lg border border-white/15 px-3 py-2 text-zinc-200">Classic setup wizard</Link>
            <Link href="/setup/keys" className="rounded-lg border border-white/15 px-3 py-2 text-zinc-200">Integration status</Link>
            <Link href="/dashboard" className="rounded-lg border border-white/15 px-3 py-2 text-zinc-200">Projects dashboard</Link>
          </div>
        </header>

        {error ? <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

        <DiscoveryWizard onApproved={onStrategyApproved} />
        <AlternativesExplorer />

        {workflow ? (
          <EngineeringBuildDashboard workflow={workflow} events={events} />
        ) : (
          <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-sm text-zinc-500">
            Approve a strategy to create a durable engineering workflow. Refreshing the browser will restore progress after creation.
          </p>
        )}

        <LivePreviewFrame url={previewUrl} title="Current LeonardX application preview" />

        <div className="grid gap-4">
          <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <h3 className="text-sm font-semibold text-white">Vercel project selection</h3>
            <p className="mt-1 text-xs text-zinc-500">{vercelMessage || 'Select by stable project id before configuring environment variables or deploying.'}</p>
            {vercelProjects.length > 0 ? (
              <label className="mt-3 block text-sm text-zinc-300">
                Discovered projects
                <select
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white"
                  value={vercelProjectId}
                  onChange={(event) => setVercelProjectId(event.target.value)}
                >
                  <option value="">Select a project id</option>
                  {vercelProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name} · {project.id}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="mt-3 block text-sm text-zinc-300">
                Vercel project id (stable identifier)
                <input
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white"
                  value={vercelProjectId}
                  onChange={(event) => setVercelProjectId(event.target.value)}
                  placeholder="prj_…"
                />
              </label>
            )}
          </section>
          <EnvConfigPanel vercelProjectId={vercelProjectId || undefined} />
        </div>

        {migrationInfo ? (
          <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <h3 className="text-sm font-semibold text-white">Database migration inspection</h3>
            <p className="mt-2 text-sm text-zinc-300">{migrationInfo.count} local migration files found.</p>
            <p className="mt-2 text-xs text-zinc-500">{migrationInfo.message}</p>
          </section>
        ) : null}
      </div>
    </LEOAppShell>
  );
}
