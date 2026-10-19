'use client';
import { authFetch } from '@/lib/client-auth';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDashed, ClipboardCheck, Code2, Database, Filter, FolderKanban, GitBranch, LockKeyhole, MessageSquare, Play, RefreshCw, Search, ShieldCheck, Users, Video, Workflow, Wrench } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type Role = { number: number; id: string; name: string; department: string; category: string; description: string; capabilities: string[]; tools: string[]; permissions: string[]; approvalRequired: boolean };
type Agent = { id: string; name: string; description: string; category: string; ownerOnly: boolean; approvalRequired: boolean; allowedTools: string[]; permissions: string[] };
type Run = { id: string; agent_id: string; task: string; status: string; created_at: string; started_at?: string | null; completed_at?: string | null; error?: string | null; result?: string | null };
type Approval = { id: string; action: string; status: string; created_at: string };
type Meeting = { id: string; title: string; status: string; updated_at: string };
type Memory = { id: string; memory: string; source?: string; created_at?: string };
const tabs = ['Overview','Role catalog','Task runner','Run history','Shared memory','Approvals','Systems & reports'] as const;
type Tab = typeof tabs[number];
const systemSections = [
  { name: 'Durable role task queue', detail: 'Queue role-specialized work with dependency gating, retry limits and lease-based recovery.', href: '/workforce/jobs', icon: Workflow, state: 'Implemented; worker must be configured' },
  { name: 'Direct engineer chat', detail: 'Open a persistent private conversation with one role-defined specialist.', href: '/workforce/conversations', icon: MessageSquare, state: 'Implemented with provider configuration' },
  { name: 'Visual meeting room', detail: 'Create meetings with real AI responses, transcripts, decisions and action items.', href: '/meeting-room', icon: Video, state: 'Implemented with provider configuration' },
  { name: 'Workflow studio', detail: 'Persistent workflow definitions and run requests.', href: '/workflows', icon: Workflow, state: 'Existing service; worker requires configuration' },
  { name: 'Project management', detail: 'Existing projects, setup flows and project delivery.', href: '/projects', icon: FolderKanban, state: 'Existing service' },
  { name: 'Developer Agent Studio', detail: 'Create private agents with approved read-only MCP tools on a paid Developer API plan.', href: '/developers/agents', icon: Code2, state: 'Paid Developer plan' },
  { name: 'Observability', detail: 'Existing health, logs and service monitoring surfaces.', href: '/observability', icon: Activity, state: 'Existing service' },
  { name: 'Audit logs', detail: 'Review the platform audit view.', href: '/audit', icon: LockKeyhole, state: 'Existing service' },
  { name: 'Integration registry', detail: 'Inspect configured integrations and their connection status.', href: '/integrations', icon: GitBranch, state: 'Existing service' },
];

export default function WorkforcePage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [roles, setRoles] = useState<Role[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState('unknown');
  const [manualAccess, setManualAccess] = useState(false);
  const [limitations, setLimitations] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All departments');
  const [task, setTask] = useState('Review the current application architecture and return a prioritized implementation plan with concrete acceptance criteria.');
  const [selectedAgent, setSelectedAgent] = useState('project-manager');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authFetch('/api/workforce', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Workforce information could not be loaded.');
      setRoles(data.role_catalog || []); setAgents(data.operational_agents || []); setRuns(data.runs || []); setApprovals(data.approvals || []); setMeetings(data.meetings || []); setMetrics(data.metrics || {}); setPlan(data.plan || 'unknown'); setManualAccess(Boolean(data.manual_agent_access)); setLimitations(data.limitations || {});
      if (data.operational_agents?.length) setSelectedAgent(current => data.operational_agents.some((agent: Agent) => agent.id === current) ? current : data.operational_agents[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Workforce information could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  const loadMemory = useCallback(async () => {
    try { const response = await authFetch('/api/memory', { cache: 'no-store' }); const data = await response.json(); if (response.ok) setMemories(data.memories || []); else setError(data.error || 'Memory could not be loaded.'); }
    catch { setError('Memory service is not reachable.'); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (tab === 'Shared memory') { const timer = window.setTimeout(() => { void loadMemory(); }, 0); return () => window.clearTimeout(timer); } }, [tab, loadMemory]);

  const departments = useMemo(() => ['All departments', ...Array.from(new Set(roles.map(role => role.department))).sort()], [roles]);
  const filteredRoles = useMemo(() => roles.filter(role => (department === 'All departments' || role.department === department) && `${role.name} ${role.department} ${role.description}`.toLowerCase().includes(query.toLowerCase())), [roles, department, query]);

  async function runTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!task.trim() || busy) return;
    setBusy(true); setError(''); setNotice('Submitting a real request to the configured agent service…');
    try {
      const response = await authFetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: selectedAgent, task: task.trim(), context: 'Submitted from the LeonardX AI Workforce dashboard. Return a concrete deliverable, list assumptions and risks, and never claim tool execution unless verified by a connected tool result.' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Task execution failed.');
      setNotice(data.status === 'waiting_approval' ? `Task created and waiting for approval (${data.run_id || 'run id unavailable'}).` : data.status === 'queued' ? `Task queued (${data.run_id}). A configured background worker must be running to execute queued work.` : `Agent response received. ${data.results?.[0]?.name || ''}`);
      setTask(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Task execution failed.'); setNotice(''); }
    finally { setBusy(false); }
  }

  async function resolveApproval(approvalId: string, decision: 'approve'|'cancel') {
    setBusy(true); setError(''); setNotice(decision === 'approve' ? 'Approving and running the requested agent…' : 'Cancelling the pending run…');
    try {
      const response = await fetch(decision === 'approve' ? '/api/agents/approve' : '/api/agents/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approval_id: approvalId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Approval could not be resolved.');
      setNotice(decision === 'approve' ? `Approval accepted. Run status: ${data.status || 'submitted'}.` : 'Pending run cancelled.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Approval could not be resolved.'); setNotice(''); }
    finally { setBusy(false); }
  }

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!memoryDraft.trim()) return;
    setBusy(true); setError('');
    try { const response = await authFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memory: memoryDraft.trim(), source: 'user' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Memory could not be saved.'); setMemoryDraft(''); await loadMemory(); setNotice('Memory saved to your account.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Memory could not be saved.'); }
    finally { setBusy(false); }
  }
  async function deleteMemory(id: string) {
    setBusy(true);
    try { const response = await authFetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Memory could not be deleted.'); await loadMemory(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Memory could not be deleted.'); }
    finally { setBusy(false); }
  }

  const metricCards = [
    { label: 'Role definitions', value: metrics.role_definitions ?? 0, detail: 'Specialist catalog', icon: Users },
    { label: 'Operational agents', value: metrics.operational_agents ?? 0, detail: 'Available in current plan', icon: Bot },
    { label: 'Running tasks', value: metrics.running_tasks ?? 0, detail: 'From saved run records', icon: Activity },
    { label: 'Queued tasks', value: metrics.queued_tasks ?? 0, detail: 'Awaiting execution', icon: CircleDashed },
    { label: 'Completed runs', value: metrics.completed_tasks ?? 0, detail: 'Recent history only', icon: CheckCircle2 },
    { label: 'Failed runs', value: metrics.failed_tasks ?? 0, detail: 'Recent history only', icon: AlertTriangle },
    { label: 'Pending approvals', value: metrics.pending_approvals ?? 0, detail: 'Needs review', icon: ClipboardCheck },
    { label: 'Saved meetings', value: metrics.saved_meetings ?? 0, detail: 'Persistent meeting records', icon: Video },
  ];

  return <LEOAppShell title="AI Workforce" subtitle="Specialist roles, authorized agent execution, meeting records and actual run history.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold)]/[.06] p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--gold)]/10 text-[var(--gold)]"><Bot size={22}/></div><div><p className="text-sm font-bold">LeonardX AI Workforce Control</p><p className="mt-1 text-xs text-zinc-400">Role catalog and operational execution are separate: roles do not automatically receive tools or privileges.</p></div></div><div className="flex flex-wrap gap-2"><a href="/meeting-room" className="inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-3 py-2 text-sm font-bold text-black"><Video size={15}/> Meeting room</a><a href="/workforce/conversations" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"><MessageSquare size={15}/> Direct chat</a><button onClick={() => void load()} className="rounded-xl border border-white/10 p-2 text-zinc-300 hover:bg-white/5" aria-label="Refresh workforce"><RefreshCw size={16}/></button></div></div>
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={`mb-4 rounded-xl border p-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/[.04] text-zinc-300'}`}>{error || notice}<button className="float-right text-zinc-500" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-1">{tabs.map(item => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? 'bg-[var(--gold)] text-black' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{item}</button>)}</div>
    {loading ? <Panel><p className="text-sm text-zinc-400">Loading real workforce data…</p></Panel> : <>
      {tab === 'Overview' && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(card => <Panel key={card.label} className="!p-4"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">{card.label}</span><card.icon size={16} className="text-[var(--gold)]"/></div><p className="mt-3 text-3xl font-bold text-white">{card.value}</p><p className="mt-1 text-[10px] text-zinc-600">{card.detail}</p></Panel>)}</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2"><Panel><h2 className="text-sm font-semibold">Current execution configuration</h2><div className="mt-3 space-y-3 text-xs">{[{label:'Account plan',value:plan},{label:'Manual agent access',value:manualAccess?'Allowed by current plan':'Restricted by current plan'},{label:'Model provider',value:limitations.meeting_model_configured?'OpenAI API key detected':'No OpenAI API key detected'},{label:'Durable agent worker',value:limitations.durable_agent_worker_enabled?'Worker flag reports enabled; scheduler health unverified':'Worker flag reports disabled; scheduler must be configured'},{label:'Local model endpoint',value:limitations.local_inference_configured?'Endpoint URL configured; reachability not verified':'Not configured'}].map(item => <div key={item.label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2"><span className="text-zinc-500">{item.label}</span><span className="text-right text-zinc-200">{item.value}</span></div>)}</div><p className="mt-3 text-[10px] leading-5 text-zinc-600">A configured endpoint or environment flag does not prove that the provider or worker is healthy. The dashboard reports configuration, not unverified service health.</p></Panel>
          <Panel><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Recent agent runs</h2><p className="mt-1 text-xs text-zinc-500">Statuses from the account&apos;s run records.</p></div><button onClick={() => setTab('Run history')} className="inline-flex items-center gap-1 text-xs text-[var(--gold)]">View all <ArrowRight size={13}/></button></div>{runs.length ? <div className="mt-3 space-y-2">{runs.slice(0,6).map(run => <div key={run.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div className="mt-0.5 rounded-lg bg-white/5 p-2 text-zinc-300"><Bot size={15}/></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-zinc-200">{run.agent_id}</p><p className="mt-1 line-clamp-2 text-xs text-zinc-500">{run.task}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(run.created_at).toLocaleString()}</p></div><StatusPill status={run.status}/></div>)}</div> : <p className="mt-5 text-sm text-zinc-500">No saved agent runs were returned for this account.</p>}</Panel></div>
        <Panel className="mt-4"><div className="mb-3 flex items-center gap-2"><Workflow size={17} className="text-[var(--gold)]"/><h2 className="text-sm font-semibold">Workforce sections</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{systemSections.map(section => <a key={section.href} href={section.href} className="rounded-xl border border-white/10 bg-black/15 p-3 transition hover:border-[var(--gold)]/25 hover:bg-white/[.03]"><section.icon size={18} className="text-[var(--gold)]"/><p className="mt-3 text-sm font-semibold">{section.name}</p><p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">{section.detail}</p><p className="mt-3 flex items-center justify-between gap-2 text-[10px] text-zinc-600"><span>{section.state}</span><ArrowRight size={12}/></p></a>)}</div></Panel>
      </>}
      {tab === 'Role catalog' && <Panel><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-semibold">Professional AI role catalog</h2><p className="mt-1 text-xs text-zinc-500">{roles.length} role definitions across departments. These profiles can participate in model-powered meetings; the catalog does not grant shell, repository, or privileged tool access.</p></div><span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300">{filteredRoles.length} shown</span></div><div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_260px]"><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={15} className="text-zinc-500"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search role, department or responsibility" className="w-full bg-transparent py-2.5 text-sm outline-none"/></label><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Filter size={14} className="text-zinc-500"/><select value={department} onChange={event => setDepartment(event.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none">{departments.map(item => <option key={item} value={item} className="bg-zinc-900">{item}</option>)}</select></label></div><div className="mt-4 grid gap-2 md:grid-cols-2">{filteredRoles.map(role => <article key={role.id} className="rounded-xl border border-white/10 bg-black/15 p-3"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--gold)]/10 text-xs font-bold text-[var(--gold)]">{String(role.number).padStart(2,'0')}</span><div className="min-w-0"><h3 className="text-xs font-semibold text-zinc-100">{role.name}</h3><p className="mt-1 text-[10px] text-[var(--gold)]/80">{role.department}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{role.description}</p><div className="mt-2 flex flex-wrap gap-1">{role.capabilities.map(capability => <span key={capability} className="rounded-md border border-white/5 px-1.5 py-1 text-[9px] text-zinc-600">{capability}</span>)}</div></div></div></article>)}</div></Panel>}
      {tab === 'Task runner' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr]" ><Panel><h2 className="text-sm font-semibold">Submit a real agent task</h2><p className="mt-1 text-xs leading-5 text-zinc-500">This calls the existing authorized agent execution API. It does not grant new repository or shell tools. Tool-backed code changes require a connected and authorized tool.</p><form onSubmit={runTask} className="mt-4 space-y-3"><label className="block text-xs text-zinc-400">Operational agent<select value={selectedAgent} onChange={event => setSelectedAgent(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-zinc-200">{agents.map(agent => <option key={agent.id} value={agent.id} className="bg-zinc-900">{agent.name}{agent.approvalRequired?' · approval required':''}</option>)}</select></label><label className="block text-xs text-zinc-400">Task objective<textarea value={task} onChange={event => setTask(event.target.value)} rows={6} maxLength={12000} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[var(--gold)]/50"/></label><button disabled={busy || !task.trim() || !agents.length} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50"><Play size={15}/>{busy?'Submitting…':'Submit task'}</button></form></Panel><Panel><h2 className="text-sm font-semibold">Execution boundaries</h2><ul className="mt-3 space-y-3 text-xs leading-5 text-zinc-500"><li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400"/>Server-side account, plan and permission checks remain in force.</li><li className="flex gap-2"><Wrench size={15} className="mt-0.5 shrink-0 text-[var(--gold)]"/>The model only has the tools explicitly connected to its agent definition.</li><li className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400"/>If a provider or worker is unavailable, the UI shows the actual error rather than faking completion.</li><li className="flex gap-2"><Database size={15} className="mt-0.5 shrink-0 text-zinc-400"/>Run records and results are stored by the existing agent service when its database is configured.</li></ul></Panel></div>}
      {tab === 'Run history' && <Panel><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Agent run history</h2><p className="mt-1 text-xs text-zinc-500">Recent records returned by the backend.</p></div><button onClick={() => void load()} className="rounded-lg border border-white/10 p-2 text-zinc-400"><RefreshCw size={14}/></button></div>{runs.length ? <div className="mt-4 space-y-2">{runs.map(run => <article key={run.id} className="rounded-xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{run.agent_id}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{run.task}</p><p className="mt-2 text-[10px] text-zinc-600">Run ID: {run.id} · Created {new Date(run.created_at).toLocaleString()}</p>{run.error && <p className="mt-2 text-xs text-red-300">{run.error}</p>}{run.result && <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--gold)]">View saved result</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{run.result}</p></details>}</div><StatusPill status={run.status}/></div></article>)}</div> : <p className="mt-5 text-sm text-zinc-500">No run records available.</p>}</Panel>}
      {tab === 'Shared memory' && <Panel><h2 className="text-sm font-semibold">User-approved memory</h2><p className="mt-1 text-xs text-zinc-500">This view uses the existing Leo memory API and is scoped to the signed-in account. Project/agent-specific memory is not yet unified here.</p><form onSubmit={saveMemory} className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} maxLength={1000} placeholder="Add a useful preference or project fact…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-[var(--gold)]/50"/><button disabled={busy || !memoryDraft.trim()} className="rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">Save memory</button></form><div className="mt-4 space-y-2">{memories.map(memory => <article key={memory.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3"><div><p className="whitespace-pre-wrap text-sm text-zinc-300">{memory.memory}</p><p className="mt-2 text-[10px] text-zinc-600">{memory.source || 'saved'}{memory.created_at ? ` · ${new Date(memory.created_at).toLocaleString()}` : ''}</p></div><button onClick={() => void deleteMemory(memory.id)} disabled={busy} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-500 hover:text-red-300">Delete</button></article>)}{!memories.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-zinc-600">No saved memories were returned.</p>}</div></Panel>}
      {tab === 'Approvals' && <Panel><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-[var(--gold)]"/><h2 className="text-sm font-semibold">Pending approvals</h2></div><p className="mt-1 text-xs text-zinc-500">Requests shown here come from existing agent approval records.</p>{approvals.length ? <div className="mt-4 space-y-2">{approvals.map(approval => <article key={approval.id} className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-sm font-semibold text-zinc-200">{approval.action}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(approval.created_at).toLocaleString()} · {approval.id}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={approval.status}/><button disabled={busy} onClick={() => void resolveApproval(approval.id, 'approve')} className="rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-bold text-black disabled:opacity-50">Approve and run</button><button disabled={busy} onClick={() => void resolveApproval(approval.id, 'cancel')} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 disabled:opacity-50">Cancel run</button></div></article>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center"><CheckCircle2 size={22} className="mx-auto text-zinc-600"/><p className="mt-2 text-sm text-zinc-300">No pending approvals in the returned records</p><p className="mt-1 text-xs text-zinc-600">This dashboard currently reads approval records; approval decisions remain in the existing protected control plane.</p></div>}</Panel>}
      {tab === 'Systems & reports' && <><Panel><h2 className="text-sm font-semibold">Connected platform surfaces</h2><p className="mt-1 text-xs text-zinc-500">These are links to existing LeonardX modules. This dashboard does not pretend that every specification area has a dedicated service behind it.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{systemSections.map(section => <a key={section.href} href={section.href} className="flex gap-3 rounded-xl border border-white/10 bg-black/15 p-3 hover:bg-white/[.03]"><section.icon size={18} className="mt-0.5 shrink-0 text-[var(--gold)]"/><div><p className="text-sm font-semibold text-zinc-200">{section.name}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{section.detail}</p><p className="mt-2 text-[10px] text-zinc-600">{section.state}</p></div></a>)}</div></Panel><Panel className="mt-4"><h2 className="text-sm font-semibold">Implementation and configuration status</h2><div className="mt-3 space-y-3 text-xs">{[{label:'Role catalog',value:`${roles.length} role definitions loaded from the specification`},{label:'Operational registry',value:`${agents.length} currently permitted agent definitions returned by the existing service`},{label:'Meeting persistence',value:`${meetings.length} meeting records returned for this account`},{label:'Cloud AI',value:limitations.meeting_model_configured?'API key is configured in server environment (provider reachability not tested here)':'Requires OPENAI_API_KEY for live meeting responses'},{label:'Durable background worker',value:limitations.durable_agent_worker_enabled?'Worker flag reports enabled; scheduler and queue health still require verification':'Requires a trusted scheduler calling the protected worker endpoint'},{label:'Local/offline inference',value:limitations.local_inference_configured?'A local model URL is configured; availability is not verified':'A real local model runtime is not configured'}].map(item => <div key={item.label} className="border-b border-white/5 pb-2"><p className="text-zinc-300">{item.label}</p><p className="mt-1 leading-5 text-zinc-500">{item.value}</p></div>)}</div></Panel></>}
    </>}
  </LEOAppShell>;
}
