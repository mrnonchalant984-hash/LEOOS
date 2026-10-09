'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Play, ShieldCheck, Timer, Wrench, XCircle, RotateCw } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type Agent = { id: string; name: string; description: string; ownerOnly: boolean; approvalRequired: boolean };
type Run = { id: string; agent_id: string; task: string; status: string; created_at: string; started_at?: string | null; completed_at?: string | null; error?: string | null };

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [agentResponse, runResponse] = await Promise.all([fetch('/api/agents'), fetch('/api/agents/runs')]);
      if (!agentResponse.ok) throw new Error('Agent registry could not be loaded.');
      const agentData = await agentResponse.json();
      const runData = runResponse.ok ? await runResponse.json() : { runs: [] };
      setAgents(agentData.agents || []);
      setRuns(runData.runs || []);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Agent data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function runTask() {
    if (!task.trim() || busy) return;
    setBusy(true);
    setMessage('Submitting task…');
    try {
      const response = await fetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task }) });
      const data = await response.json();
      setMessage(data.message || data.error || (response.ok ? 'Task submitted.' : 'Task could not be submitted.'));
      if (response.ok) { setTask(''); await load(); }
    } catch {
      setMessage('Could not reach the agent service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <LEOAppShell title="Agents" subtitle="Specialized execution with server-side permissions.">
    <div className="page-hero agent-control-hero">
      <span className="mini-label">Agent control plane</span>
      <h2>Give Leo a job, not just a question.</h2>
      <p>Tasks are routed to authorized specialists. High-impact agents can require confirmation and owner-only capabilities remain server protected.</p>
      <div className="hero-actions">
        <textarea value={task} onChange={event => setTask(event.target.value)} placeholder="Describe a task for an agent…" aria-label="Task for an agent" className="min-h-20 w-full max-w-2xl rounded-xl border border-white/10 bg-black/30 p-3 text-xs outline-none focus:border-violet-300/50" />
        <button className="primary-button self-end" onClick={runTask} disabled={busy || !task.trim()}>{busy ? <Timer size={14} className="animate-spin" /> : <Play size={14} />} {busy ? 'Submitting' : 'Run task'}</button>
      </div>
      {message && <p className="mt-3 text-[10px] text-zinc-400" role="status">{message}</p>}
    </div>
    {loadError && <div className="agent-load-error" role="alert"><span>{loadError}</span><button className="secondary-button" onClick={() => void load()}><RotateCw size={13}/> Retry</button></div>}
    <div className="section-grid">
      <Panel className="agent-glass-panel">
        <div className="flex items-center justify-between"><div><div className="panel-title">Available agents</div><div className="panel-subtitle">Loaded from the configured registry.</div></div><span className="status-pill"><Bot size={11}/> {agents.length} agents</span></div>
        <div className="data-list mt-4">{loading ? <div className="agent-skeleton-list" aria-label="Loading agents"><i/><i/><i/></div> : agents.length ? agents.slice(0, 30).map(agent => <div className="data-card agent-state-card" key={agent.id}>
          <div className="data-icon agent-orb"><Bot size={15}/></div><main><strong>{agent.name}</strong><small>{agent.description}</small></main>
          {agent.ownerOnly ? <span className="status-pill"><ShieldCheck size={10}/> owner</span> : agent.approvalRequired ? <span className="status-pill"><Wrench size={10}/> approval</span> : <span className="status-pill status-connected">available</span>}
        </div>) : <div className="agent-empty-state"><Bot size={18}/><strong>No agents available</strong><small>The agent registry has no entries for this account.</small></div>}</div>
      </Panel>
      <Panel className="agent-glass-panel">
        <div className="panel-title">Recent runs</div><div className="panel-subtitle">Run status and timestamps reported by the service.</div>
        <div className="data-list mt-4">{loading ? <div className="agent-skeleton-list" aria-label="Loading runs"><i/><i/></div> : runs.length ? runs.map(run => <div className="data-card agent-state-card" key={run.id}>
          <div className={`data-icon agent-orb ${run.status.toLowerCase()}`}><Timer size={15}/></div><main><strong>{run.agent_id}</strong><small>{run.task}</small><small className="agent-run-time">{run.completed_at ? `Completed ${new Date(run.completed_at).toLocaleString()}` : run.started_at ? `Started ${new Date(run.started_at).toLocaleString()}` : `Queued ${new Date(run.created_at).toLocaleString()}`}</small>{run.error && <small className="agent-run-error">{run.error}</small>}</main><StatusPill status={run.status}/>
        </div>) : <div className="agent-empty-state"><XCircle size={18}/><strong>No agent runs yet</strong><small>Submit a task above to start one.</small></div>}</div>
      </Panel>
    </div>
  </LEOAppShell>;
}
