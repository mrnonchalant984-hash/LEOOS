'use client';

import { Check, Circle, LoaderCircle, Ban, AlertTriangle, Pause } from 'lucide-react';
import type { EngineeringWorkflow, WorkflowStageRecord } from '@/lib/engineering-workflow';
import { overallProgress } from '@/lib/engineering-workflow';

function StageIcon({ status }: { status: WorkflowStageRecord['status'] }) {
  if (status === 'COMPLETED') return <Check size={14} className="text-emerald-300" aria-hidden />;
  if (status === 'RUNNING') return <LoaderCircle size={14} className="animate-spin text-[var(--gold-bright)]" aria-hidden />;
  if (status === 'WAITING_FOR_USER') return <Pause size={14} className="text-amber-300" aria-hidden />;
  if (status === 'FAILED') return <AlertTriangle size={14} className="text-rose-300" aria-hidden />;
  if (status === 'BLOCKED' || status === 'CANCELLED') return <Ban size={14} className="text-zinc-500" aria-hidden />;
  return <Circle size={14} className="text-zinc-600" aria-hidden />;
}

export function EngineeringBuildDashboard({
  workflow,
  events = [],
}: {
  workflow: EngineeringWorkflow & { progress?: ReturnType<typeof overallProgress> };
  events?: Array<{ id: string; stage: string | null; event_type: string; message: string; created_at: string }>;
}) {
  const progress = workflow.progress || overallProgress(workflow.stages);
  const applicable = workflow.stages.filter((stage) => stage.applicable);

  return (
    <section aria-label="Live engineering build dashboard" className="grid gap-5">
      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--gold-bright)]">Live build dashboard</p>
            <h2 className="mt-2 text-xl font-bold text-white">{workflow.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Mode {workflow.mode} · {workflow.status}
              {workflow.currentStage ? ` · ${workflow.currentStage}` : ''}
            </p>
          </div>
          <div className="min-w-[140px] text-right">
            <p className="text-3xl font-black text-white">{progress.percent}%</p>
            <p className="text-xs text-zinc-500">{progress.completed}/{progress.applicable} stages</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="mt-3 text-sm text-zinc-300">{progress.nextAction}</p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {applicable.map((stage) => (
          <li
            key={stage.id}
            className={`rounded-xl border px-3 py-3 text-sm ${
              stage.status === 'RUNNING' || stage.status === 'WAITING_FOR_USER'
                ? 'border-[var(--gold)]/35 bg-[var(--gold)]/10'
                : stage.status === 'COMPLETED'
                  ? 'border-emerald-400/20 bg-emerald-400/[.04]'
                  : stage.status === 'FAILED'
                    ? 'border-rose-400/25 bg-rose-400/[.06]'
                    : 'border-white/10 bg-black/20'
            }`}
          >
            <div className="flex items-start gap-2">
              <StageIcon status={stage.status} />
              <div className="min-w-0">
                <p className="font-semibold text-white">{stage.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{stage.progressMessage || stage.status}</p>
                {stage.error ? <p className="mt-1 text-xs text-rose-300">{stage.error.message}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <h3 className="text-sm font-semibold text-white">Visual development timeline</h3>
        <p className="mt-1 text-xs text-zinc-500">Events are backed by stored workflow operations.</p>
        <ul className="mt-4 grid gap-3">
          {events.length === 0 ? (
            <li className="text-sm text-zinc-500">No events recorded yet.</li>
          ) : (
            events.map((event) => (
              <li key={event.id} className="border-l border-white/15 pl-3">
                <p className="text-sm text-zinc-200">{event.message}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  {event.stage || 'workflow'} · {event.event_type} · {new Date(event.created_at).toLocaleString()}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
