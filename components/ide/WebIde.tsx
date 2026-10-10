'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileCode2, Play, Save, TerminalSquare } from 'lucide-react';

type Workspace = { id: string; project_name: string; type: string | null; status: string | null; files: Record<string, string> };
type TerminalLine = { kind: 'input' | 'output' | 'error'; text: string };

function flattenFiles(files: Record<string, string>) {
  return Object.keys(files).sort((a, b) => a.localeCompare(b));
}

export default function WebIde({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const [terminalInput, setTerminalInput] = useState('help');
  const [terminal, setTerminal] = useState<TerminalLine[]>([{ kind: 'output', text: 'LEO workspace console · safe preview mode\nType "help" to see available commands.' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const filePaths = useMemo(() => flattenFiles(files), [files]);

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Workspace could not be loaded.');
      const record = result.data as Workspace;
      const loadedFiles = record.files || {};
      setWorkspace(record);
      setFiles(loadedFiles);
      setSelected(previous => previous && previous in loadedFiles ? previous : Object.keys(loadedFiles).sort()[0] || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Workspace could not be loaded.');
        if (!active) return;
        const record = result.data as Workspace;
        const loadedFiles = record.files || {};
        setWorkspace(record);
        setFiles(loadedFiles);
        setSelected(previous => previous && previous in loadedFiles ? previous : Object.keys(loadedFiles).sort()[0] || '');
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Workspace could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);

  async function saveFiles() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Files could not be saved.');
      setTerminal(lines => [...lines, { kind: 'output', text: 'Workspace files saved.' }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Files could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function createFile() {
    const path = window.prompt('New file path (relative to the workspace)');
    if (!path?.trim()) return;
    if (path.startsWith('/') || path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) {
      setError('Enter a safe relative file path without traversal segments.');
      return;
    }
    setFiles(previous => ({ ...previous, [path.replaceAll('\\', '/').replace(/^\.\//, '')]: '' }));
    setSelected(path.replaceAll('\\', '/').replace(/^\.\//, ''));
    setError('');
  }

  function runPreviewCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;
    const [verb, ...args] = command.split(/\s+/);
    let output = '';
    let kind: TerminalLine['kind'] = 'output';
    if (verb === 'help') output = 'Supported preview commands: help, ls, cat <path>, clear\nThis panel does not execute shell commands or run project code.';
    else if (verb === 'ls') output = filePaths.length ? filePaths.join('\n') : 'No project files yet.';
    else if (verb === 'cat') {
      const path = args.join(' ');
      output = path in files ? files[path] : `File not found: ${path || '(missing path)'}`;
      if (!(path in files)) kind = 'error';
    } else if (verb === 'clear') { setTerminal([]); setTerminalInput(''); return; }
    else { output = 'Command not available in preview mode. The workspace console is intentionally non-executing.'; kind = 'error'; }
    setTerminal(lines => [...lines, { kind: 'input', text: `$ ${command}` }, { kind, text: output }]);
    setTerminalInput('');
  }

  if (loading) return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] p-6 text-sm text-white/60">Loading workspace…</main>;
  if (error && !workspace) return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] p-8 text-white"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-white/60">{error}</p><button onClick={() => { setLoading(true); setError(''); void loadWorkspace(); }} className="mt-5 rounded-md border border-white/15 px-4 py-2">Try again</button></main>;

  return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] px-3 py-5 text-white sm:px-6">
    <header className="mx-auto mb-4 flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs text-white/45"><Link href="/dashboard" className="hover:text-white">Dashboard</Link><ChevronRight size={13}/><span>Web IDE</span></div><h1 className="mt-1 text-xl font-semibold">{workspace?.project_name || 'Workspace'}</h1></div>
      <div className="flex items-center gap-2"><span className="rounded border border-white/10 px-2 py-1 text-xs text-white/55">{workspace?.status || 'Workspace'}</span><button onClick={() => void saveFiles()} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#d7aa70] px-3 py-2 text-sm font-medium text-black disabled:opacity-60"><Save size={15}/>{saving ? 'Saving…' : 'Save files'}</button></div>
    </header>
    {error && <div role="alert" className="mx-auto mb-3 max-w-[1600px] rounded-md border border-red-400/30 bg-red-950/30 px-4 py-2 text-sm text-red-200">{error}</div>}
    <section aria-label="Workspace editor" className="mx-auto grid min-h-[68vh] max-w-[1600px] overflow-hidden rounded-xl border border-white/10 bg-[#101114] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
      <div className="flex min-h-[58vh] flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4 text-xs text-white/55"><FileCode2 size={15}/> Files <button onClick={createFile} className="ml-auto rounded px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">New file</button><span>{filePaths.length} items</span></div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(150px,0.28fr)_minmax(0,1fr)]">
          <nav aria-label="Project files" className="overflow-auto border-r border-white/10 p-2">{filePaths.length ? filePaths.map(path => <button key={path} onClick={() => setSelected(path)} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${selected === path ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><FileCode2 size={14}/><span className="truncate">{path}</span></button>) : <p className="px-2 py-3 text-xs leading-5 text-white/45">No files in this workspace yet. Create files in the project builder to edit them here.</p>}</nav>
          <div className="flex min-h-[50vh] min-w-0 flex-col"><div className="h-10 border-b border-white/10 px-4 py-3 font-mono text-xs text-white/55">{selected || 'No file selected'}</div>{selected ? <textarea aria-label={`Edit ${selected}`} spellCheck={false} value={files[selected] || ''} onChange={event => setFiles(previous => ({ ...previous, [selected]: event.target.value }))} className="min-h-[48vh] flex-1 resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-[#e6e7e9] outline-none focus:ring-1 focus:ring-inset focus:ring-[#d7aa70]/40" /> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-white/40">Choose a project file to start editing.</div>}</div>
        </div>
      </div>
      <aside aria-label="Workspace terminal" className="flex min-h-[45vh] flex-col bg-[#0b0c0e]">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4 text-xs text-white/60"><TerminalSquare size={15}/> Workspace console <span className="ml-auto rounded bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide">Preview only</span></div>
        <div className="flex-1 space-y-3 overflow-auto p-4 font-mono text-xs leading-5" aria-live="polite">{terminal.map((line, index) => <pre key={`${index}-${line.text}`} className={`whitespace-pre-wrap break-words ${line.kind === 'input' ? 'text-[#d7aa70]' : line.kind === 'error' ? 'text-red-300' : 'text-white/65'}`}>{line.text}</pre>)}</div>
        <form onSubmit={runPreviewCommand} className="flex items-center gap-2 border-t border-white/10 p-3"><span aria-hidden="true" className="font-mono text-[#d7aa70]">›</span><input aria-label="Preview command" value={terminalInput} onChange={event => setTerminalInput(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-white/35" placeholder="help, ls, cat <path>"/><button aria-label="Run preview command" className="rounded p-2 text-white/60 hover:bg-white/10 hover:text-white"><Play size={14}/></button></form>
      </aside>
    </section>
  </main>;
}
