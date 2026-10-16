'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Bot, Plus, Save, Trash2, X } from 'lucide-react';

type Tool = { name: string; description: string };
type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  allowed_tools: string[];
  created_at: string;
};
type Draft = Pick<Agent, 'name' | 'description' | 'instructions'> & { allowed_tools: string[] };
type AgentStudioResponse = { plan: string; agents: Agent[]; tools: Tool[] };

class AgentStudioRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function fetchAgentStudio(): Promise<AgentStudioResponse> {
  const response = await fetch('/api/developers/agents', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new AgentStudioRequestError(data.error || 'Agent Studio could not be loaded.', response.status);
  return {
    plan: typeof data.plan === 'string' ? data.plan : '',
    agents: Array.isArray(data.agents) ? data.agents : [],
    tools: Array.isArray(data.tools) ? data.tools : [],
  };
}

const emptyDraft: Draft = {
  name: '',
  description: '',
  instructions: 'Help the user with the selected specialty. Be accurate, explain assumptions, and never claim actions that were not completed.',
  allowed_tools: [],
};

export function AgentStudio() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [plan, setPlan] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsPlan, setNeedsPlan] = useState(false);

  const updateFromResponse = useCallback((data: AgentStudioResponse) => {
    setError('');
    setNeedsPlan(false);
    setAgents(data.agents);
    setTools(data.tools);
    setPlan(data.plan);
  }, []);

  const showLoadError = useCallback((cause: unknown) => {
    if (cause instanceof AgentStudioRequestError && cause.status === 403) setNeedsPlan(true);
    setError(cause instanceof Error ? cause.message : 'Agent Studio could not be loaded.');
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      updateFromResponse(await fetchAgentStudio());
    } catch (cause) {
      showLoadError(cause);
    } finally {
      setLoading(false);
    }
  }, [showLoadError, updateFromResponse]);

  useEffect(() => {
    let active = true;
    fetchAgentStudio().then(data => {
      if (active) updateFromResponse(data);
    }).catch(cause => {
      if (active) showLoadError(cause);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [showLoadError, updateFromResponse]);

  function startEdit(agent: Agent) {
    setEditing(agent.id);
    setDraft({
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      allowed_tools: agent.allowed_tools,
    });
    setError('');
    setNotice('');
  }

  function resetForm() {
    setEditing('');
    setDraft(emptyDraft);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(editing ? `/api/developers/agents/${encodeURIComponent(editing)}` : '/api/developers/agents', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The custom agent could not be saved.');
      setNotice(editing ? 'Custom agent updated.' : 'Custom agent created. It is now available in Leo’s tool picker.');
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The custom agent could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(agent: Agent) {
    if (!window.confirm(`Delete ${agent.name}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/developers/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The custom agent could not be deleted.');
      if (editing === agent.id) resetForm();
      setNotice('Custom agent deleted.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The custom agent could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Bot size={18}/> Your agents</h2><p className="mt-1 text-xs text-zinc-500">Developer plan: {plan || 'checking access'}. Each agent is private to your account.</p></div>
        <button type="button" onClick={() => { resetForm(); setError(''); setNotice(''); }} className="inline-flex items-center gap-2 rounded-lg bg-[var(--gold)] px-3 py-2 text-xs font-semibold text-black"><Plus size={14}/> New agent</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-3 text-sm text-emerald-200">{notice}</p>}
      {needsPlan && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">Agent Studio is included with paid Developer API plans. <Link href="/developers/pricing" className="ml-1 underline">View plans</Link></div>}
      {loading ? <p className="mt-5 text-sm text-zinc-500">Loading your private agents…</p> : agents.length ? <ul className="mt-5 divide-y divide-white/10">
        {agents.map(agent => <li key={agent.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0"><h3 className="font-semibold">{agent.name}</h3><p className="mt-1 text-sm text-zinc-400">{agent.description}</p><p className="mt-2 text-xs text-zinc-600">{agent.allowed_tools.length ? `${agent.allowed_tools.length} read-only tools` : 'No external tools'} · Private to your account</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => startEdit(agent)} disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">Edit</button><button type="button" onClick={() => void remove(agent)} disabled={busy} aria-label={`Delete ${agent.name}`} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-red-300 disabled:opacity-50"><Trash2 size={14}/></button></div>
        </li>)}
      </ul> : !needsPlan && <p className="mt-5 text-sm text-zinc-500">No custom agents yet. Create one to start using your own instructions with Leo.</p>}
      <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">Agents can call only tools you have already connected and approved as read-only. Custom URLs, credentials, write actions, and uploaded executable code are not supported.</p>
    </section>

    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
      <h2 className="text-lg font-semibold">{editing ? 'Edit agent' : 'Create an agent'}</h2>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block text-sm text-zinc-300">Name<input required minLength={3} maxLength={50} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"/></label>
        <label className="block text-sm text-zinc-300">Description<input required maxLength={200} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"/></label>
        <label className="block text-sm text-zinc-300">Instructions<textarea required minLength={30} maxLength={4000} rows={7} value={draft.instructions} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black px-3 py-2 text-sm leading-6 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"/></label>
        <fieldset>
          <legend className="text-sm text-zinc-300">Approved read-only tools <span className="text-xs text-zinc-500">(up to 8)</span></legend>
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-white/10 p-3">
            {tools.length ? tools.map(tool => <label key={tool.name} className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={draft.allowed_tools.includes(tool.name)} disabled={!draft.allowed_tools.includes(tool.name) && draft.allowed_tools.length >= 8} onChange={event => setDraft(current => ({ ...current, allowed_tools: event.target.checked ? [...current.allowed_tools, tool.name] : current.allowed_tools.filter(name => name !== tool.name) }))} className="mt-0.5 accent-yellow-300"/>
              <span><strong>{tool.name}</strong><span className="mt-0.5 block text-zinc-500">{tool.description}</span></span>
            </label>) : <p className="text-xs text-zinc-500">No approved tools are connected. You can save an agent without tools.</p>}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || loading || needsPlan} className="inline-flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"><Save size={14}/>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create agent'}</button>
          {editing && <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"><X size={14}/>Cancel</button>}
        </div>
      </form>
    </section>
  </div>;
}
