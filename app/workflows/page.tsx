'use client';
import { authFetch } from '@/lib/client-auth';

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Play, Plus, RefreshCw, Workflow } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';

function readableStatus(status: string) {
  const labels: Record<string, string> = { draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived', queued: 'Queued', running: 'In progress', completed: 'Completed', failed: 'Failed', dead_letter: 'Needs attention' };
  return labels[status] || 'Pending';
}

type WorkflowItem = { id: string; name: string; description: string; status: string; trigger_config?: { type?: string; every_minutes?: number }; next_run_at?: string | null; definition: { steps?: Array<{ id: string; type: string; name: string }> }; recent_runs?: Array<{ id: string; status: string; created_at: string; error_code?: string | null }>; updated_at: string };

export default function WorkflowsPage() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [name, setName] = useState('New automation');
  const [description, setDescription] = useState('');
  const [stepsText, setStepsText] = useState('Agent task');
  const [trigger, setTrigger] = useState<'manual' | 'interval'>('manual');
  const [everyMinutes, setEveryMinutes] = useState('60');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try { const response = await authFetch('/api/workflows', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Your workflows could not be loaded. Please try again.'); setItems(data.workflows || []); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Your workflows could not be loaded. Please try again.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function createWorkflow() {
    setBusy(true); setMessage('');
    const steps = stepsText.split('\n').map((name, index) => name.trim()).filter(Boolean).slice(0, 5).map((stepName, index) => ({ id: `step_${index + 1}`, type: 'agent', name: stepName.slice(0, 100), config: { task: stepName } }));
    try {
      const response = await authFetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, steps, trigger, everyMinutes: Number(everyMinutes) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Your workflow could not be saved. Please try again.');
      setName('New automation'); setDescription(''); setStepsText('Agent task'); await load(); setMessage(trigger === 'interval' ? 'Your schedule has been saved.' : 'Workflow draft saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Your workflow could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  async function runWorkflow(id: string) {
    setBusy(true); setMessage('');
    try { const response = await authFetch(`/api/workflows/${id}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: {}, idempotencyKey: crypto.randomUUID() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'This workflow could not be started right now. Please try again later.'); setMessage('Your workflow run has been submitted.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'This workflow could not be started right now. Please try again later.'); }
    finally { setBusy(false); }
  }
  return <LEOAppShell title="Workflow studio" subtitle="Create and organize repeatable AI workflows.">
    <section className="page-hero"><span className="mini-label">AUTOMATION / STUDIO</span><h2>Build repeatable AI workflows.</h2><p>Build reusable workflows from clear, task-focused steps and keep your automations organized in one place.</p><div className="hero-actions"><button className="primary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh workflows</button></div></section>
    {message && <div role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm text-zinc-300">{message}</div>}
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.85fr)]">
      <Panel><div className="flex items-center gap-2"><Workflow size={18}/><h3 className="panel-title">Your workflows</h3></div>
        {items.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-white/15 p-6 text-center"><GitBranch size={26} className="mx-auto text-zinc-500"/><p className="mt-3 font-medium">No workflows yet</p><p className="mt-1 text-sm text-zinc-500">Create a draft to start defining an automation.</p></div> : <div className="mt-4 space-y-3">{items.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{item.name}</h4><p className="mt-1 text-sm text-zinc-400">{item.description || 'No description'}</p><p className="mt-2 text-xs text-zinc-500">{item.definition?.steps?.length || 0} steps · Updated {new Date(item.updated_at).toLocaleString()}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-300">{readableStatus(item.status)}</span></div><p className="mt-2 text-xs text-zinc-500">{item.status === 'active' && item.next_run_at ? `Next scheduled run: ${new Date(item.next_run_at).toLocaleString()}` : 'Manual trigger'}</p><button className="secondary-button mt-3" disabled={busy || item.status === 'archived' || item.status === 'paused'} onClick={() => void runWorkflow(item.id)}><Play size={13}/> Run workflow</button>{item.trigger_config?.type === 'interval' && <button className="secondary-button ml-2 mt-3" disabled={busy} onClick={async () => { const status = item.status === 'active' ? 'paused' : 'active'; const response = await authFetch(`/api/workflows/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); const data = await response.json(); await load(); if (!response.ok) setMessage(data.error || 'Status update failed.'); else setMessage(`Workflow ${status}.`); }}>{item.status === 'active' ? 'Pause schedule' : 'Resume schedule'}</button>}{item.recent_runs?.length ? <div className="mt-3 border-t border-white/10 pt-3"><p className="text-xs text-zinc-500">Recent runs</p><div className="mt-2 space-y-1">{item.recent_runs.map(run => <p key={run.id} className="text-xs text-zinc-400"><span className="text-zinc-200">{readableStatus(run.status)}</span> · {new Date(run.created_at).toLocaleString()}</p>)}</div></div> : null}</div>)}</div>}
      </Panel>
      <Panel><div className="flex items-center gap-2"><Plus size={18}/><h3 className="panel-title">Create a workflow draft</h3></div><label className="mt-4 block text-sm text-zinc-300">Workflow name<input value={name} onChange={e => setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label><label className="mt-3 block text-sm text-zinc-300">Description<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label><label className="mt-3 block text-sm text-zinc-300">Trigger<select value={trigger} onChange={e => setTrigger(e.target.value as 'manual' | 'interval')} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"><option value="manual">Manual run</option><option value="interval">Scheduled interval</option></select></label>{trigger === 'interval' && <label className="mt-3 block text-sm text-zinc-300">Run every (15–1440 minutes)<input type="number" min={15} max={1440} step={15} value={everyMinutes} onChange={e => setEveryMinutes(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label>}<label className="mt-3 block text-sm text-zinc-300">Steps (one step per line)<textarea value={stepsText} onChange={e => setStepsText(e.target.value)} rows={4} maxLength={2000} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label><button className="primary-button mt-4" onClick={() => void createWorkflow()} disabled={busy || name.trim().length < 2}><Plus size={14}/> Save draft</button></Panel>
    </div>
  </LEOAppShell>;
}
