"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Code2, FileSearch, Globe2, Plug, Search, Sparkles, Wrench } from 'lucide-react';

type Tab = 'skills' | 'connectors' | 'plugins';
type Tool = { name: string; description: string };
type Plugin = { plugin_id?: string; version?: string; manifest?: { name?: string; description?: string }; status?: string };
type Skill = { name: string; description: string; version: string; source: string; enabled: boolean };

const skills = [
  { name: 'Build with Leo', description: 'Plan and implement websites, web apps, mobile starters, and project workspaces through the existing builders.', icon: Code2, href: '/app' },
  { name: 'Research and sources', description: 'Run web research from the Leo composer and keep provider responses visible and attributable.', icon: Globe2, href: '/app' },
  { name: 'File review', description: 'Upload supported files and receive a real review through the authenticated file-review service.', icon: FileSearch, href: '/app' },
  { name: 'Project planning', description: 'Turn requirements into a saved project setup with plan-aware builder availability.', icon: Sparkles, href: '/setup' },
];
const connectors = [
  { name: 'GitHub', description: 'Connect repositories for authorized source-control workflows.', href: '/integrations' },
  { name: 'Vercel', description: 'Connect deployments and inspect projects you authorize.', href: '/integrations' },
  { name: 'Google Gemini', description: 'Review the server-side Gemini provider status without exposing keys.', href: '/settings/ai' },
  { name: 'Custom MCP', description: 'Manage a scoped MCP connection with read/write boundaries and approvals.', href: '/integrations' },
];

export function WorkspaceCustomize() {
  const [tab, setTab] = useState<Tab>('skills');
  const [query, setQuery] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [registeredSkills, setRegisteredSkills] = useState<Skill[]>([]);
  useEffect(() => { void (async () => { try { const r = await fetch('/api/chat/tools', { cache: 'no-store' }); const d = await r.json(); if (r.ok && Array.isArray(d.tools)) setTools(d.tools); } catch {} })(); void (async () => { try { const r = await fetch('/api/plugins', { cache: 'no-store' }); const d = await r.json(); if (r.ok && Array.isArray(d.plugins)) setPlugins(d.plugins); } catch {} })(); void (async () => { try { const r = await fetch('/api/skills', { cache: 'no-store' }); const d = await r.json(); if (r.ok && Array.isArray(d.skills)) setRegisteredSkills(d.skills); } catch {} })(); }, []);
  const needle = query.trim().toLowerCase();
  const filteredSkills = skills.filter((item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle));
  const filteredRegisteredSkills = registeredSkills.filter((item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle));
  const filteredTools = tools.filter((item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle));
  const filteredConnectors = connectors.filter((item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle));
  const filteredPlugins = plugins.filter((item) => !needle || `${item.plugin_id ?? ''} ${item.manifest?.name ?? ''} ${item.manifest?.description ?? ''}`.toLowerCase().includes(needle));
  return <>
    <header className="flex flex-wrap items-center justify-between gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Customize</h1><nav className="mt-6 flex gap-6 text-sm" aria-label="Customization sections">{(['skills', 'connectors', 'plugins'] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 pb-2 capitalize ${tab === item ? 'border-[var(--gold)] text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}>{item}</button>)}</nav></div><label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-500"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search LeonardX" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-600" aria-label="Search customization options"/></label></header>
    {tab === 'skills' && <section className="mt-10"><div className="rounded-xl border border-[var(--gold)]/20 bg-[var(--gold)]/[.06] p-6"><p className="text-xs uppercase tracking-[.16em] text-[var(--gold)]">LeonardX skills</p><h2 className="mt-2 text-2xl font-semibold">Skills load only when a task needs them</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Leo receives skill names and descriptions first, then loads instructions, references, and approved scripts on demand.</p><Link href="/developers/agents" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">Create or manage skills <ArrowRight size={14}/></Link></div><h2 className="mt-10 text-sm font-medium text-zinc-300">Built-in and registered skills</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{[...filteredRegisteredSkills.map((item) => ({ ...item, icon: Sparkles, href: `/app/customize?skill=${encodeURIComponent(item.name)}` })), ...filteredSkills, ...filteredTools.map((tool) => ({ ...tool, icon: Wrench, href: '/app' }))].map((item) => <Link key={item.name} href={item.href} className="group rounded-xl border border-white/10 bg-[#151515] p-5 hover:border-white/25 hover:bg-[#191919]"><item.icon size={20} className="text-[var(--gold)]"/><div className="mt-5 flex items-center justify-between gap-2"><h3 className="font-medium">{item.name}</h3>{'source' in item && <span className="text-[10px] uppercase tracking-wider text-zinc-600">{String(item.source)}</span>}</div><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">{item.description}</p><span className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--gold)]">Open skill <ArrowRight size={13}/></span></Link>)}</div></section>}
    {tab === 'connectors' && <section className="mt-10"><div className="grid gap-4 md:grid-cols-2">{filteredConnectors.map((item) => <Link key={item.name} href={item.href} className="group rounded-xl border border-white/10 bg-[#151515] p-5 hover:border-white/25 hover:bg-[#191919]"><Plug size={20} className="text-[var(--gold)]"/><h2 className="mt-5 font-medium">{item.name}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{item.description}</p><span className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--gold)]">Manage connector <ArrowRight size={13}/></span></Link>)}</div></section>}
    {tab === 'plugins' && <section className="mt-10"><div className="mb-6 flex items-center justify-between gap-4"><div><h2 className="text-lg font-medium">Trusted LeonardX plugins</h2><p className="mt-1 text-sm text-zinc-500">Only manifests registered in the LeonardX plugin registry are shown.</p></div><Link href="/plugins" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Boxes size={14}/> Open registry</Link></div>{filteredPlugins.length ? <div className="grid gap-4 md:grid-cols-2">{filteredPlugins.map((plugin) => <Link key={`${plugin.plugin_id}-${plugin.version}`} href="/plugins" className="rounded-xl border border-white/10 bg-[#151515] p-5 hover:border-white/25"><Boxes size={20} className="text-[var(--gold)]"/><h3 className="mt-5 font-medium">{plugin.manifest?.name || plugin.plugin_id}</h3><p className="mt-2 text-sm text-zinc-500">{plugin.manifest?.description || 'Trusted plugin manifest.'}</p><p className="mt-4 text-[10px] uppercase tracking-wider text-emerald-300">{plugin.status || 'registered'} · v{plugin.version || '—'}</p></Link>)}</div> : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">No trusted plugins are registered for this account.</div>}</section>}
  </>;
}
