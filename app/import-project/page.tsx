'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, ExternalLink, Github, Globe2, LoaderCircle, LockKeyhole, UploadCloud } from 'lucide-react';

type Connection = { id: string; provider: string; label: string; status: string };
type Source = 'website' | 'github' | 'zip';

export default function ImportProjectPage() {
  const router = useRouter();
  const [source,setSource] = useState<Source>('github');
  const [websiteUrl,setWebsiteUrl] = useState('');
  const [repositoryUrl,setRepositoryUrl] = useState('');
  const [projectName,setProjectName] = useState('');
  const [zipFile,setZipFile] = useState<File | null>(null);
  const [upgradeGoal,setUpgradeGoal] = useState<'modernize_ui'|'paystack_ecommerce'|'exact_redesign'>('modernize_ui');
  const [connections,setConnections] = useState<Connection[]>([]);
  const [connectionId,setConnectionId] = useState('');
  const [loadingConnections,setLoadingConnections] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  useEffect(()=>{
    let active=true;
    fetch('/api/integrations/connections',{cache:'no-store'}).then(async response=>{
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'GitHub connections could not be loaded.');
      const items=(Array.isArray(body.connections)?body.connections:[]) as Connection[];
      if(active){const github=items.filter(item=>item.provider==='github');setConnections(github);setConnectionId(github.find(item=>item.status==='verified')?.id||'');}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'GitHub connections could not be loaded.');}).finally(()=>{if(active)setLoadingConnections(false);});
    return ()=>{active=false;};
  },[]);

  function connectGitHub(){setError('');setNotice('Opening Integrations so you can securely connect GitHub.');router.push('/integrations');}
  async function importProject(){
    setBusy(true);setError('');setNotice('');
    try{
      let response: Response;
      if(source==='zip'){
        if(!zipFile)throw new Error('Choose a ZIP file to import.');
        const form=new FormData();
        form.set('source','zip');form.set('project_name',projectName);form.set('zip',zipFile);
        response=await fetch('/api/workspaces/import',{method:'POST',body:form});
      }else{
        response=await fetch('/api/workspaces/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          source,project_name:projectName,upgrade_goal:upgradeGoal,
          ...(source==='website'?{website_url:websiteUrl}:{repository_url:repositoryUrl,github_connection_id:connectionId}),
        })});
      }
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Project import failed.');
      setNotice('Imported ' + (body.import?.imported_files||0) + ' files. Opening your workspace...');
      router.replace(body.workspace_url||('/ide/'+encodeURIComponent(body.project.id)));
    }catch(e){setError(e instanceof Error?e.message:'Project import failed.');setBusy(false);}
  }

  const verifiedConnections=connections.filter(item=>item.status==='verified');
  const canImport=source==='website'?websiteUrl.trim().length>0:source==='github'?repositoryUrl.trim().length>0&&Boolean(connectionId):Boolean(zipFile);
  return <main className="min-h-screen bg-[var(--lx-bg)] px-4 py-10 text-[var(--lx-text)] sm:px-6">
    <div className="mx-auto max-w-3xl">
      <button onClick={()=>router.back()} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"><ArrowLeft size={16}/> Back</button>
      <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">LEONARDX · PROJECT SETUP</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Import your website or project</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">Bring a public website in as a reference, or import a GitHub repository into a private Leo workspace. Your source is kept separate from other users.</p></div>
      <div className="grid grid-cols-3 gap-3">
        <button onClick={()=>{setSource('github');setError('');}} aria-pressed={source==='github'} className={'rounded-2xl border p-5 text-left transition '+(source==='github'?'border-zinc-900 bg-white shadow-lg':'border-zinc-200 bg-white/60')}><Github className="mb-4" size={22}/><b className="block">GitHub repository</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Import source files from a connected account.</span></button>
        <button onClick={()=>{setSource('zip');setError('');}} aria-pressed={source==='zip'} className={'rounded-2xl border p-5 text-left transition '+(source==='zip'?'border-zinc-900 bg-white shadow-lg':'border-zinc-200 bg-white/60')}><UploadCloud className="mb-4" size={22}/><b className="block">Project ZIP</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Import a local source archive.</span></button>
        <button onClick={()=>{setSource('website');setError('');}} aria-pressed={source==='website'} className={'rounded-2xl border p-5 text-left transition '+(source==='website'?'border-zinc-900 bg-white shadow-lg':'border-zinc-200 bg-white/60')}><Globe2 className="mb-4" size={22}/><b className="block">Live website URL</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Save a readable website reference for Leo.</span></button>
      </div>
      <section className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
        {source==='website'?<div className="space-y-4"><label className="block text-sm font-semibold">Website URL<input value={websiteUrl} onChange={e=>setWebsiteUrl(e.target.value)} placeholder="https://example.com" type="url" className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal outline-none focus:border-indigo-500"/></label><p className="text-xs leading-5 text-zinc-500">LeonardX safely fetches the public page and stores its title, description and readable text. A public URL does not expose the site&apos;s private source code, so this creates a reference workspace for Leo to analyse and rebuild.</p></div>
        :source==='github'?<div className="space-y-4"><label className="block text-sm font-semibold">GitHub repository URL<input value={repositoryUrl} onChange={e=>setRepositoryUrl(e.target.value)} placeholder="https://github.com/owner/repository" type="url" className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal outline-none focus:border-indigo-500"/></label>
          {loadingConnections?<p className="flex items-center gap-2 text-xs text-zinc-500"><LoaderCircle className="animate-spin" size={14}/> Checking connected GitHub accounts...</p>
          :verifiedConnections.length?<label className="block text-sm font-semibold">GitHub account<select value={connectionId} onChange={e=>setConnectionId(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal">{verifiedConnections.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          :<div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Connect GitHub to continue</p><p className="mt-1 text-xs leading-5">LeonardX uses the existing encrypted GitHub integration. It does not ask you to paste a token here.</p><button onClick={connectGitHub} className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white">Connect GitHub <ExternalLink size={13}/></button></div>}
          <div className="rounded-xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600"><p className="flex items-center gap-2 font-semibold text-zinc-800"><LockKeyhole size={14}/> Safe import limits</p><p className="mt-1">Imports up to 250 text files and 2 MB. Credential files, private keys, dependencies, build output and binary assets are skipped. Repository files are not pushed or modified.</p></div>
          <p className="text-xs leading-5 text-zinc-500">For Lovable, Bolt and v0 projects, use their GitHub sync or export-to-GitHub option, then paste the resulting repository URL here.</p>
        </div>:<div className="space-y-4"><label className="block text-sm font-semibold">Project ZIP<input type="file" accept=".zip,application/zip" onChange={event=>setZipFile(event.target.files?.[0]||null)} className="mt-2 block w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal"/></label><p className="text-xs leading-5 text-zinc-500">ZIP imports are limited to 10 MB compressed, 250 source files and 2 MB extracted text. Secrets, binaries, dependency folders and build output are skipped.</p>{zipFile&&<p className="text-xs text-indigo-700">{zipFile.name} · {(zipFile.size/1024/1024).toFixed(2)} MB</p>}</div>}
        {source==='website'&&<label className="mt-4 block text-sm font-semibold">Upgrade goal<select value={upgradeGoal} onChange={event=>setUpgradeGoal(event.target.value as typeof upgradeGoal)} className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal"><option value="modernize_ui">Modernize UI</option><option value="paystack_ecommerce">Convert to E-Commerce with Paystack</option><option value="exact_redesign">Exact Redesign</option></select></label>}
        <label className="mt-5 block text-sm font-semibold">Workspace name <span className="font-normal text-zinc-400">(optional)</span><input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Use the source name" className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-normal outline-none focus:border-indigo-500"/></label>
        {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice&&<p role="status" className="mt-5 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">{notice}</p>}
        <button disabled={!canImport||busy||(source==='github'&&loadingConnections)} onClick={()=>void importProject()} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy?<><LoaderCircle className="animate-spin" size={17}/> Importing project...</>:<>Import into Leo Workspace <ArrowRight size={17}/></>}</button>
      </section>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-zinc-500"><UploadCloud size={14}/> Your imported workspace is saved to your LeonardX account.</p>
    </div>
  </main>;
}
