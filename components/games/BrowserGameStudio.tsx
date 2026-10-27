'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, Gamepad2, Play, Plus, RefreshCw, Save, Terminal, WandSparkles, Upload, Wrench, Trash2 } from 'lucide-react';

type Project = { id: string; project_name: string; type: string | null; status: string | null; progress: number | null; created_at?: string; files?: Record<string,string> };
type Diagnostic = { level: 'error' | 'warning' | 'info'; message: string; at: string };
type GameAsset = { id: string; name: string; kind: string; mime_type: string; size_bytes: number; url: string | null; path?: string; created_at: string };
type Publication = { state?: string; live_url?: string | null; repo_url?: string; commit_url?: string; deployment_state?: string; updated_at?: string; last_error?: string | null };

export default function BrowserGameStudio({ initialProjects, initialSelectedId }: { initialProjects: Project[]; initialSelectedId?: string }) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedId, setSelectedId] = useState(initialSelectedId && initialProjects.some(item => item.id === initialSelectedId) ? initialSelectedId : initialProjects[0]?.id || '');
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<Record<string,string>>({});
  const [brief, setBrief] = useState('Create a 2D endless runner with jump controls, obstacles, score, collision detection, and mobile touch controls.');
  const [name, setName] = useState('My Browser Game');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [assets, setAssets] = useState<GameAsset[]>([]);
  const [publication, setPublication] = useState<Publication>({});
  const [publishing, setPublishing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState('src/main.js');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const filePaths = useMemo(() => Object.keys(files).filter(path => path !== 'leonardx.publication.json').sort(), [files]);

  const loadProject = useCallback(async (id: string) => {
    if (!id) { setProject(null); setFiles({}); setAssets([]); return; }
    setLoading(true); setError(''); setDiagnostics([]);
    try {
      const response = await fetch(`/api/setup/projects?project_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Project could not be loaded.');
      setProject(result.project); setFiles(result.project.files || {});
      setName(result.project.project_name || 'My Browser Game');
      try { const manifest = JSON.parse(String(result.project.files?.['leonardx.game.json'] || '{}')); const description = manifest?.brief?.description; if (typeof description === 'string' && description.trim()) setBrief(description.slice(0,12000)); } catch { /* Keep the current brief if the optional manifest is absent. */ }
      const assetResponse = await fetch(`/api/games/${encodeURIComponent(id)}/assets`, { cache: 'no-store' });
      const assetResult = await assetResponse.json().catch(() => null);
      setAssets(assetResponse.ok && Array.isArray(assetResult?.assets) ? assetResult.assets : []);
      const publicationResponse = await fetch(`/api/games/${encodeURIComponent(id)}/publish`, { cache: 'no-store' });
      const publicationResult = await publicationResponse.json().catch(() => null);
      setPublication(publicationResponse.ok && publicationResult?.publication && typeof publicationResult.publication === 'object' ? publicationResult.publication : {});
      setSelectedFile(Object.keys(result.project.files || {}).filter((path:string) => path !== 'leonardx.publication.json').sort()[0] || '');
      setFrameKey(key => key + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void loadProject(selectedId); }, 0); return () => window.clearTimeout(timer); }, [selectedId, loadProject]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data || event.data.source !== 'leonardx-game-preview') return;
      const level = event.data.level === 'error' ? 'error' : event.data.level === 'warning' ? 'warning' : 'info';
      setDiagnostics(current => [...current.slice(-39), { level, message: String(event.data.message || 'Browser preview event').slice(0,500), at: new Date().toLocaleTimeString() }]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const createGame = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/setup/projects', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ project_type:'game', business_name:name.trim(), requirements:{ description:brief, runtime:'browser', generation_source:'browser_game_studio' } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Browser game project could not be created.');
      const created = result.project as Project;
      setProjects(current => [created, ...current.filter(item => item.id !== created.id)]); setSelectedId(created.id);
      const generation = await fetch(`/api/games/${encodeURIComponent(created.id)}/generate`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ brief }) });
      const generated = await generation.json().catch(() => null);
      if (!generation.ok) { setError(`Project created, but Leo could not finish generation: ${generated?.error || 'Provider unavailable.'} Open the project and retry generation.`); return; }
      setDiagnostics(current => [...current, {level:'info',message:`Leo generated and saved ${generated.files_saved} source files with ${generated.model}. Browser execution has not been automatically certified.`,at:new Date().toLocaleTimeString()}]);
      await loadProject(created.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project creation failed.'); }
    finally { setBusy(false); }
  };
  const saveFiles = async () => {
    if (!project) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(project.id)}/files`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({files}) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Files could not be saved.');
      setProject(current => current ? {...current, files} : current); setDiagnostics(current => [...current.slice(-39), {level:'info',message:'Project source saved to the owned workspace.',at:new Date().toLocaleTimeString()}]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Save failed.'); }
    finally { setBusy(false); }
  };

  const generateGame = async (mode: 'generate' | 'repair' = 'generate') => {
    if (!project) return;
    if (mode === 'repair' && diagnostics.filter(item => item.level === 'error').length === 0) { setError('No preview runtime errors are available to repair yet.'); return; }
    setBusy(true); setRepairing(mode === 'repair'); setError('');
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(project.id)}/generate`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ mode, brief, diagnostics: diagnostics.filter(item => item.level === 'error').map(item => item.message) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Leo could not generate the game.');
      await loadProject(project.id);
      setDiagnostics(current => [...current.slice(-39), {level:'info',message:`Leo ${mode === 'repair' ? 'saved a targeted repair' : 'generated project-specific code'} (${result.files_saved} files). This is not a claim of a passed browser test.`,at:new Date().toLocaleTimeString()}]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Game generation failed.'); }
    finally { setBusy(false); setRepairing(false); }
  };
  const publishGame = async () => {
    if (!project) return;
    const approved = window.confirm('Publish this browser game? LeonardX will create or update a private GitHub repository and request a production deployment through your connected Vercel account.');
    if (!approved) return;
    setPublishing(true); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(project.id)}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      const result = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) throw new Error(result?.error || result?.message || 'Game publishing failed.');
      setPublication({ state: result?.state || 'building', live_url: result?.live_url || null, repo_url: result?.repository || publication.repo_url, commit_url: result?.commit_url, deployment_state: result?.deployment_state, updated_at: new Date().toISOString(), last_error: result?.state === 'failed' ? result?.message : null });
      setDiagnostics(current => [...current.slice(-39), { level: result?.published ? 'info' : 'warning', message: String(result?.message || 'Publishing operation returned without a verified public URL.'), at: new Date().toLocaleTimeString() }]);
      await loadProject(project.id);
      if (!result?.published && response.status === 202) setError('Source committed. Vercel is still building; click Publish / update again after a short wait to check its verified status.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Game publishing failed.'); }
    finally { setBusy(false); setPublishing(false); }
  };

  const unpublishGame = async () => {
    if (!project || !publication.deployment_state || publication.state !== 'published') return;
    if (!window.confirm('Unpublish this game by deleting its recorded Vercel deployment? This does not delete the GitHub source repository.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(project.id)}/publish`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.unpublished !== true) throw new Error(result?.error || 'Vercel did not confirm unpublishing.');
      setPublication(current => ({ ...current, state: 'unpublished', live_url: null, deployment_state: 'DELETED', updated_at: new Date().toISOString() }));
      setDiagnostics(current => [...current.slice(-39), { level: 'info', message: 'Vercel confirmed deletion of the recorded deployment. GitHub source remains available.', at: new Date().toLocaleTimeString() }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unpublishing failed.'); }
    finally { setBusy(false); }
  };

  const uploadAsset = async (file?: File) => {
    if (!project || !file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch(`/api/games/${encodeURIComponent(project.id)}/assets`, { method:'POST', body:form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Asset upload failed.');
      setAssets(current => [result.asset as GameAsset, ...current]);
      setDiagnostics(current => [...current.slice(-39), {level:'info',message:`Saved asset “${result.asset.name}” to private project storage.`,at:new Date().toLocaleTimeString()}]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Asset upload failed.'); }
    finally { setBusy(false); }
  };
  const deleteAsset = async (asset: GameAsset) => {
    if (!project) return;
    setBusy(true); setError('');
    try { const response = await fetch(`/api/games/${encodeURIComponent(project.id)}/assets?asset_id=${encodeURIComponent(asset.id)}`, {method:'DELETE'}); const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Asset could not be deleted.'); setAssets(current=>current.filter(item=>item.id!==asset.id)); }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Asset delete failed.'); } finally { setBusy(false); }
  };

  const previewHtml = useMemo(() => {
    let html = files['index.html'] || '';
    const isModuleGame = /<script\b[^>]*type=["']module["']/i.test(html);
    const js = isModuleGame ? (files['src/three-scene.js'] || files['src/main.js']) : files['src/main.js'];
    const moduleSourceTag = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["'](?:\.\/)?([^"']+)["'][^>]*>\s*<\/script>/i);
    if (moduleSourceTag && files[moduleSourceTag[1]]) {
      const moduleSource = files[moduleSourceTag[1]];
      html = html.replace(moduleSourceTag[0], `<script type="module">${moduleSource.replace(/<\/script/gi,'<\\/script')}</script>`);
    } else if (js && /<script\s+src=["'](?:\.\/)?src\/main\.js["']\s*><\/script>/i.test(html)) {
      html = html.replace(/<script\s+src=["'](?:\.\/)?src\/main\.js["']\s*><\/script>/i, `<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);
    } else if (js && isModuleGame) {
      html = html.replace(/(<script type=["']module["']>)[\s\S]*?(<\/script>)/i, (_match, open, close) => `${open}${js.replace(/<\/script/gi,'<\\/script')}${close}`);
    } else if (js) {
      html = html.replace(/(<script>)[\s\S]*?(<\/script>)/i, (_match, open, close) => `${open}${js.replace(/<\/script/gi,'<\\/script')}${close}`);
    }
    if (!html) return '';
    for (const asset of assets) { if (asset.path && asset.url) html = html.split(asset.path).join(asset.url); }
    // Override any generated CSP with the Studio's own restrictive policy. The iframe has no allow-same-origin permission.
    html = html.replace(/<meta[^>]+http-equiv=[\"']Content-Security-Policy[\"'][^>]*>/gi, '');
    const csp = `<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline'; img-src data: blob: https://*.supabase.co; media-src data: blob: https://*.supabase.co; connect-src https://cdn.jsdelivr.net https://unpkg.com; font-src data: https://fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';\">`;
    html = html.replace(/<head[^>]*>/i, match => `${match}${csp}`);
    const diagnosticsScript = `<script>(()=>{const send=(level,message)=>parent.postMessage({source:'leonardx-game-preview',level,message:String(message||'Runtime event').slice(0,500)},'*');addEventListener('error',e=>send('error',e.message||'Runtime error'));addEventListener('unhandledrejection',e=>send('error',e.reason||'Unhandled promise rejection'));const original=console.error.bind(console);console.error=(...args)=>{send('error',args.map(v=>typeof v==='string'?v:(v&&v.message)||String(v)).join(' ').slice(0,500));original(...args)};send('info','Preview document loaded');})();<\/script>`;
    return html.replace(/<\/head>/i, `${diagnosticsScript}</head>`);
  }, [files, frameKey, assets]);

  return <div className="mx-auto max-w-[1500px] px-4 py-6 text-zinc-100 sm:px-7 lg:px-10">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-cyan-300"><Gamepad2 size={18}/> Browser Game Studio</div><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Create, preview and export browser games</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Projects run in a sandboxed browser frame. Use Leo AI or the connected MCP to generate project-specific source, then save, preview and export it here.</p></div><a href="/app" className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">Back to Leo chat</a></header>
    {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#11151d] p-4"><h2 className="flex items-center gap-2 font-semibold"><WandSparkles size={16} className="text-cyan-300"/> New browser game</h2><label className="mt-4 block text-xs text-zinc-400">Project name<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"/></label><label className="mt-3 block text-xs text-zinc-400">Describe your game<textarea value={brief} onChange={e=>setBrief(e.target.value)} rows={5} maxLength={12000} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-white outline-none focus:border-cyan-500"/></label><button disabled={busy||!name.trim()||!brief.trim()} onClick={()=>void createGame()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><Plus size={16}/>{busy?'Working…':'Create & generate game with Leo'}</button><p className="mt-2 text-[11px] leading-4 text-zinc-500">Creates a persistent project, then calls the configured Leo model to generate project-specific source. Browser tests and publishing are separate verified steps.</p></section>
        <section className="rounded-2xl border border-white/10 bg-[#11151d] p-4"><h2 className="font-semibold">Your game projects</h2><div className="mt-3 space-y-2">{projects.length?projects.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId===item.id?'border-cyan-400/50 bg-cyan-400/10':'border-white/5 bg-black/20 hover:bg-white/5'}`}><span className="block truncate text-sm font-medium">{item.project_name}</span><span className="mt-1 block text-[11px] text-zinc-500">{item.status||'draft'} · {item.type||'game'}</span></button>):<p className="text-sm text-zinc-500">No browser games yet.</p>}</div></section>
      </aside>
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11151d]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><div><h2 className="font-semibold">{project?.project_name||'Live preview'}</h2><p className="mt-1 text-xs text-zinc-500">{loading?'Loading project…':project?'Sandboxed preview · changes must be saved before export':'Choose or create a project'}</p></div><div className="flex flex-wrap gap-2"><button disabled={!project||busy} onClick={()=>void generateGame('generate')} className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"><WandSparkles size={14}/>Generate / edit with Leo</button><button disabled={!project||busy} onClick={()=>void saveFiles()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"><Save size={14}/>Save source</button><button disabled={!previewHtml} onClick={()=>setFrameKey(k=>k+1)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"><RefreshCw size={14}/>Restart</button><a aria-disabled={!project} href={project?`/api/games/${encodeURIComponent(project.id)}/export`:undefined} className={`inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 ${!project?'pointer-events-none opacity-40':''}`}><Download size={14}/>Export ZIP</a><button disabled={!project||busy||!files['index.html']} onClick={()=>void publishGame()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-40"><ExternalLink size={14}/>{publishing?'Publishing…':publication.live_url?'Publish / update':'Publish game'}</button>{publication.state==='published'&&<button disabled={busy} onClick={()=>void unpublishGame()} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-40">Unpublish</button>}</div></div>{publication.live_url&&<div className="border-b border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm"><span className="text-emerald-200">Published and verified:</span> <a className="break-all underline" href={publication.live_url} target="_blank" rel="noreferrer">{publication.live_url}</a>{publication.repo_url&&<span className="ml-2 text-xs text-zinc-400">· <a className="underline" href={publication.repo_url} target="_blank" rel="noreferrer">GitHub source</a></span>}</div>}{publication.state&&publication.state!=='published'&&<div className="border-b border-white/10 px-4 py-2 text-xs text-zinc-400">Publication status: {publication.state}{publication.deployment_state?` · Vercel ${publication.deployment_state}`:''}{publication.last_error?` · ${publication.last_error}`:''}</div>}<div className="relative h-[420px] bg-[#080d16] sm:h-[520px]">{previewHtml?<iframe key={frameKey} ref={frameRef} title={`${project?.project_name||'Game'} preview`} srcDoc={previewHtml} sandbox="allow-scripts" referrerPolicy="no-referrer" className="h-full w-full border-0"/>:<div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-zinc-500"><Play size={28}/><p className="text-sm">A playable preview appears when the selected project has an index.html entry point.</p></div>}</div></section>
        <section className="rounded-2xl border border-white/10 bg-[#11151d] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Project assets</h2><p className="mt-1 text-xs text-zinc-500">Private per-user storage · PNG/JPEG/WebP and MP3/OGG/WAV · max 8 MB each</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"><Upload size={14}/>Upload asset<input type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav" disabled={!project||busy} className="sr-only" onChange={e=>{void uploadAsset(e.target.files?.[0]);e.currentTarget.value='';}}/></label></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{assets.length?assets.map(asset=><div key={asset.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/5 bg-black/20 p-2.5">{asset.mime_type.startsWith('image/')&&asset.url?<img src={asset.url} alt="" className="h-10 w-10 rounded object-cover"/>:<div className="flex h-10 w-10 items-center justify-center rounded bg-white/5 text-xs">{asset.kind}</div>}<div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{asset.name}</p><p className="text-[10px] text-zinc-500">{Math.ceil(asset.size_bytes/1024)} KB · {asset.path || asset.mime_type}</p></div><button aria-label={`Delete ${asset.name}`} disabled={busy} onClick={()=>void deleteAsset(asset)} className="rounded p-1 text-zinc-500 hover:text-red-300 disabled:opacity-40"><Trash2 size={14}/></button></div>):<p className="text-xs text-zinc-500">No uploaded assets for this project yet.</p>}</div></section>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0 rounded-2xl border border-white/10 bg-[#11151d] p-4"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><Terminal size={16}/> Source files</h2><span className="text-[11px] text-zinc-500">{filePaths.length} files</span></div><label className="mt-3 block text-xs text-zinc-400">File<select value={selectedFile} onChange={e=>setSelectedFile(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#080d16] px-3 py-2 text-sm text-white">{filePaths.map(path=><option key={path} value={path}>{path}</option>)}</select></label><textarea aria-label="Selected source file" value={files[selectedFile]||''} onChange={e=>setFiles(current=>({...current,[selectedFile]:e.target.value}))} spellCheck={false} className="mt-3 h-64 w-full resize-y rounded-lg border border-white/10 bg-[#080d16] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-cyan-500"/><p className="mt-2 text-[11px] text-zinc-500">Edits remain local to this page until you select Save source. Preview refreshes when reloaded.</p></div><div className="rounded-2xl border border-white/10 bg-[#11151d] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Runtime diagnostics</h2><span className="text-[11px] text-zinc-500">{diagnostics.length} events</span></div><div className="mt-2 flex justify-end"><button disabled={!project||busy||!diagnostics.some(item=>item.level==='error')} onClick={()=>void generateGame('repair')} className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-400/10 disabled:opacity-40"><Wrench size={13}/>{repairing?'Repairing…':'Repair runtime errors with Leo (max 2)'}</button></div><div className="mt-3 max-h-[340px] space-y-2 overflow-auto">{diagnostics.length?diagnostics.slice().reverse().map((d,i)=><div key={`${d.at}-${i}`} className="rounded-lg border border-white/5 bg-black/20 p-2.5"><div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-bold uppercase ${d.level==='error'?'text-red-300':d.level==='warning'?'text-amber-300':'text-cyan-300'}`}>{d.level}</span><span className="text-[10px] text-zinc-600">{d.at}</span></div><p className="mt-1 break-words text-xs leading-5 text-zinc-300">{d.message}</p></div>):<p className="text-sm leading-6 text-zinc-500">No preview events received yet. Browser diagnostics are best-effort; they do not replace an automated browser test suite.</p>}</div></div></section>
        {project && <a href={`/ide/${encodeURIComponent(project.id)}`} className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">Open full workspace editor <ExternalLink size={14}/></a>}
      </div>
    </div>
  </div>;
}
