'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, History, Play, ToggleLeft, ToggleRight, Trash2, Upload } from 'lucide-react';

type Skill = { name: string; description: string; version: string; source: string; enabled: boolean };
type Execution = { id: string; script_path: string; status: string; exit_code: number | null; stdout: string; stderr: string; duration_ms: number | null; created_at: string };
type Version = { version: string; description: string; created_at: string };

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function SkillManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expanded, setExpanded] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [scriptPath, setScriptPath] = useState('scripts/main.mjs');
  const [scriptInput, setScriptInput] = useState('{}');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch('/api/skills', { cache: 'no-store' });
    const data = await readJson(response);
    if (response.ok && Array.isArray(data.skills)) setSkills(data.skills);
    else setNotice(data.error || 'Skills could not be loaded.');
  }

  useEffect(() => {
    let active = true;
    void fetch('/api/skills', { cache: 'no-store' }).then(readJson).then(data => {
      if (!active) return;
      if (Array.isArray(data.skills)) setSkills(data.skills);
      else setNotice(data.error || 'Skills could not be loaded.');
    }).catch(() => { if (active) setNotice('Skills could not be loaded.'); });
    return () => { active = false; };
  }, []);

  async function createSkill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    const skillMarkdown = `---\nname: ${name}\ndescription: ${description.replace(/[\r\n]/g, ' ')}\nversion: 1.0.0\n---\n\n# ${name}\n\n${description}`;
    try {
      const response = await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, markdown: skillMarkdown }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill could not be created.');
      setName(''); setDescription(''); setNotice('Skill installed at version 1.0.0.'); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill could not be created.'); }
    finally { setBusy(false); }
  }

  async function importSkill(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setNotice('');
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch('/api/skills/import', { method: 'POST', body: form });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill ZIP could not be installed.');
      setNotice(`Installed ${data.skill?.name || 'skill'} ${data.skill?.version || ''}.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill ZIP could not be installed.'); }
    finally { event.target.value = ''; setBusy(false); }
  }

  async function loadDocs(skillName: string) {
    setBusy(true); setNotice(''); setExpanded(skillName); setExecutions([]); setVersions([]);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, { cache: 'no-store' });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill documentation could not be loaded.');
      const frontmatter = `---\nname: ${data.name}\ndescription: ${String(data.description || '').replace(/[\r\n]/g, ' ')}\nversion: ${data.version}\n---`;
      setMarkdown(`${frontmatter}\n\n${data.body || ''}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill documentation could not be loaded.'); }
    finally { setBusy(false); }
  }

  async function saveDocs(skillName: string) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill could not be updated.');
      setNotice(`Saved skill version ${data.skill?.version || ''}.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill could not be updated.'); }
    finally { setBusy(false); }
  }

  async function toggleSkill(skill: Skill) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !skill.enabled }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill status could not be changed.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill status could not be changed.'); }
    finally { setBusy(false); }
  }

  async function deleteSkill(skill: Skill) {
    if (!window.confirm(`Delete ${skill.name}? This removes its current files and version history.`)) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, { method: 'DELETE' });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill could not be deleted.');
      setExpanded(''); setNotice(`Deleted ${skill.name}.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill could not be deleted.'); }
    finally { setBusy(false); }
  }

  async function loadHistory(skillName: string) {
    const response = await fetch(`/api/skills/${encodeURIComponent(skillName)}/history`, { cache: 'no-store' });
    const data = await readJson(response);
    if (!response.ok) { setNotice(data.error || 'Version history could not be loaded.'); return; }
    setVersions(Array.isArray(data.versions) ? data.versions : []);
  }

  async function loadExecutions(skillName: string) {
    const response = await fetch(`/api/skills/${encodeURIComponent(skillName)}/executions`, { cache: 'no-store' });
    const data = await readJson(response);
    if (!response.ok) { setNotice(data.error || 'Execution logs could not be loaded.'); return; }
    setExecutions(Array.isArray(data.executions) ? data.executions : []);
  }

  async function runScript(skillName: string) {
    let input: unknown;
    try { input = JSON.parse(scriptInput); }
    catch { setNotice('Script input must be valid JSON.'); return; }
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/skills/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: skillName, script_path: scriptPath, input, confirm: true }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Skill script did not complete.');
      setNotice(`Script ${data.status}${typeof data.exit_code === 'number' ? ` (exit ${data.exit_code})` : ''}.`);
      await loadExecutions(skillName);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Skill script did not complete.'); }
    finally { setBusy(false); }
  }

  return <section id="your-skills" className="mt-8 rounded-xl border border-white/10 bg-[#121212] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Your skills</h3><p className="mt-1 text-xs text-zinc-500">Create or install a bundle, edit versioned instructions, and inspect real isolated script results.</p></div><label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload size={14}/>Import skill ZIP<input className="sr-only" type="file" accept=".zip,application/zip" onChange={event => void importSkill(event)}/></label></div>
    <form onSubmit={event => void createSkill(event)} className="mt-5 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="skill-name" aria-label="New skill name" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--gold)]/50"/><input required maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="What this skill helps Leo do" aria-label="New skill description" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--gold)]/50"/><button disabled={busy} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">Create skill</button></form>
    {notice && <p role="status" className="mt-3 text-xs text-amber-200">{notice}</p>}
    <div className="mt-4 space-y-3">{skills.filter(skill => skill.source === 'user').map(skill => <article key={skill.name} className="rounded-lg border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-medium">{skill.name} <span className="text-xs text-zinc-500">v{skill.version}</span></h4><p className="mt-1 text-xs leading-5 text-zinc-500">{skill.description}</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => void toggleSkill(skill)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1.5 text-xs text-zinc-300">{skill.enabled ? <ToggleRight size={15}/> : <ToggleLeft size={15}/>} {skill.enabled ? 'Enabled' : 'Disabled'}</button><a href={`/api/skills/${encodeURIComponent(skill.name)}/export`} className="rounded border border-white/10 p-2 text-zinc-300" title="Export skill ZIP" aria-label={`Export ${skill.name}`}><Download size={14}/></a><button type="button" onClick={() => void deleteSkill(skill)} className="rounded border border-white/10 p-2 text-red-300" title="Delete skill" aria-label={`Delete ${skill.name}`}><Trash2 size={14}/></button><button type="button" onClick={() => expanded === skill.name ? setExpanded('') : void loadDocs(skill.name)} className="rounded border border-white/10 p-2 text-zinc-300" title="View and edit documentation" aria-label={`Edit ${skill.name} documentation`}><FileText size={14}/></button><button type="button" onClick={() => void loadHistory(skill.name)} className="rounded border border-white/10 p-2 text-zinc-300" title="View version history" aria-label={`History for ${skill.name}`}><History size={14}/></button></div></div>
      {expanded === skill.name && <div className="mt-4 space-y-3"><label className="block text-xs text-zinc-500">SKILL.md <textarea value={markdown} onChange={event => setMarkdown(event.target.value)} className="mt-2 min-h-48 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-[var(--gold)]/50"/></label><button type="button" disabled={busy} onClick={() => void saveDocs(skill.name)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">Save new version</button><div className="grid gap-2 sm:grid-cols-[2fr_2fr_auto]"><input value={scriptPath} onChange={event => setScriptPath(event.target.value)} aria-label="Skill script path" className="rounded border border-white/10 bg-black/20 px-2 py-2 font-mono text-xs"/><input value={scriptInput} onChange={event => setScriptInput(event.target.value)} aria-label="Skill script JSON input" className="rounded border border-white/10 bg-black/20 px-2 py-2 font-mono text-xs"/><button type="button" disabled={busy || !skill.enabled} onClick={() => void runScript(skill.name)} className="inline-flex items-center justify-center gap-1 rounded bg-emerald-400/15 px-3 py-2 text-xs text-emerald-200 disabled:opacity-40"><Play size={13}/>Run isolated script</button></div><div className="flex gap-3 text-xs"><button type="button" onClick={() => void loadHistory(skill.name)} className="text-zinc-400 underline">Refresh version history</button><button type="button" onClick={() => void loadExecutions(skill.name)} className="text-zinc-400 underline">Refresh execution logs</button></div>{versions.length > 0 && <ul className="space-y-1 text-xs text-zinc-400">{versions.map(item => <li key={item.version}>{item.version} · {item.description} · {new Date(item.created_at).toLocaleString()}</li>)}</ul>}{executions.map(item => <div key={item.id} className="rounded border border-white/10 p-3 text-xs"><p className="text-zinc-300">{item.status} · {item.script_path} · {item.duration_ms ?? '—'} ms · {new Date(item.created_at).toLocaleString()}</p>{item.stdout && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-emerald-200/80">{item.stdout}</pre>}{item.stderr && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-red-200/80">{item.stderr}</pre>}</div>)}</div>}
    </article>)}</div>
  </section>;
}
