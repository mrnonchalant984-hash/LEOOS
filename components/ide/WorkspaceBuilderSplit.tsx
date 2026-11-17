'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowUp, Code2, ExternalLink, LoaderCircle, Monitor, Smartphone, Wrench } from 'lucide-react';

type ChatLine = { role: 'user' | 'assistant'; content: string };
export function WorkspaceBuilderSplit({ projectId, projectName, previewUrl, previewError, initialSessionId = '', onOpenCode, onCreatePreview }: {
  projectId: string; projectName: string; previewUrl: string | null; previewError: string; initialSessionId?: string; onOpenCode: () => void; onCreatePreview: () => void;
}) {
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [prompt, setPrompt] = useState('');
  const sessionIdRef = useRef(initialSessionId);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState<'desktop'|'mobile'>('desktop');
  const [error, setError] = useState('');
  const [frameError, setFrameError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialSessionId) return;
    sessionIdRef.current = initialSessionId;
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    void supabase.auth.getSession().then(({data}) => {
      if (!data.session) return;
      void fetch('/api/chat?session_id=' + encodeURIComponent(initialSessionId), {headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'})
        .then(response=>response.json()).then(body=>setMessages(Array.isArray(body.messages)?body.messages.filter((m:unknown):m is ChatLine=>Boolean(m&&typeof m==='object'&&'role'in m&&'content'in m)).map((m:ChatLine)=>({role:m.role,content:m.content})):[])).catch(()=>{});
    });
  }, [initialSessionId]);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'end'});},[messages,busy]);

  const send = useCallback(async (value: string, requestType: 'build'|'repair' = 'build') => {
    const text=value.trim();
    if(!text||busy)return;
    const activeSessionId = sessionIdRef.current || crypto.randomUUID();
    sessionIdRef.current = activeSessionId;
    setBusy(true);setError('');
    setMessages(current=>[...current,{role:'user',content:text}]);
    try{
      const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const {data:auth}=await supabase.auth.getSession();
      if(!auth.session)throw new Error('Your session expired. Sign in again to continue.');
      const response=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.session.access_token,'Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify({session_id:activeSessionId,message:text,project_id:projectId,mode:'tools',work_mode:true,request_type:requestType,request_id:crypto.randomUUID()}),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Coder could not process this workspace request.');
      setMessages(current=>[...current,{role:'assistant',content:body.reply||'Coder completed the request.'}]);
      setPrompt('');
    }catch(cause){setError(cause instanceof Error?cause.message:'Coder could not process this request.');}
    finally{setBusy(false);}
  },[busy,projectId]);

  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void send(prompt);}
  const effectivePreviewError=previewError||frameError;
  const repairText=effectivePreviewError||'The project preview is not loading as expected. Inspect the workspace source, identify the runtime or rendering issue, make the smallest safe correction, and explain what changed.';
  return <section className="mx-auto mb-5 grid min-h-[640px] max-w-[1600px] overflow-hidden rounded-2xl border border-white/10 bg-[#111319] text-white shadow-2xl lg:grid-cols-[minmax(300px,35fr)_minmax(0,65fr)]">
    <aside className="flex min-h-[540px] flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-300">Coder builder</p><h2 className="truncate text-sm font-semibold">{projectName}</h2></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">Project linked</span></header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-xl bg-white/[.04] p-3 text-xs leading-5 text-white/60">Coder is working with this project&apos;s saved workspace context. Review generated changes in the Code workspace below.</div>
        {messages.map((message,index)=><div key={index} className={'max-w-[95%] rounded-2xl px-3 py-3 text-sm leading-6 '+(message.role==='user'?'ml-auto bg-indigo-500/20 text-indigo-50':'bg-white/[.06] text-white/85')}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{message.role==='user'?'You':'Coder'}</p><p className="whitespace-pre-wrap break-words">{message.content}</p></div>)}
        {busy&&<div className="flex items-center gap-2 text-xs text-indigo-200"><LoaderCircle size={14} className="animate-spin"/> Coder is working on your project…</div>}
        <div ref={endRef}/>
      </div>
      {error&&<p role="alert" className="mx-3 mb-2 rounded-lg bg-red-950/50 p-2 text-xs text-red-200">{error}</p>}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-2"><button onClick={()=>void send('Build a polished, responsive Next.js application from this project brief. Inspect the existing files first, preserve working features, implement the requested product, and verify the result.', 'build')} disabled={busy} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/70 hover:bg-white/10">Continue building</button><button onClick={()=>void send('Implement a secure Paystack checkout flow for this project. Use server-only PAYSTACK_SECRET_KEY, a public NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, server-side transaction verification and HMAC SHA-512 webhook verification. Do not request or expose secret values in chat; provide secure environment-variable setup instructions.', 'build')} disabled={busy} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/70 hover:bg-white/10">Monetize with Paystack</button></div>
        <form onSubmit={submit} className="rounded-xl border border-white/10 bg-black/25 p-2"><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} rows={3} placeholder="Ask Coder to build or improve this project…" className="w-full resize-y bg-transparent px-2 py-1 text-sm outline-none placeholder:text-white/35"/><div className="flex justify-end"><button disabled={busy||!prompt.trim()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 disabled:opacity-40">{busy?<LoaderCircle size={14} className="animate-spin"/>:<ArrowUp size={14}/>} Send to Leo</button></div></form>
      </div>
    </aside>
    <section className="flex min-h-[540px] min-w-0 flex-col bg-[#f1f3f7] text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3"><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">Preview</span><button onClick={onOpenCode} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"><Code2 size={13}/> Code</button></div><div className="flex items-center gap-1"><button onClick={()=>setViewport('desktop')} aria-pressed={viewport==='desktop'} className={'rounded-lg p-2 '+(viewport==='desktop'?'bg-slate-100':'text-slate-400')}><Monitor size={15}/></button><button onClick={()=>setViewport('mobile')} aria-pressed={viewport==='mobile'} className={'rounded-lg p-2 '+(viewport==='mobile'?'bg-slate-100':'text-slate-400')}><Smartphone size={15}/></button>{previewUrl&&<a href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ExternalLink size={15}/></a>}</div></header>
      {effectivePreviewError&&<div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"><div><p className="text-xs font-semibold">Preview needs attention</p><p className="mt-1 text-xs">{effectivePreviewError}</p></div><button onClick={()=>void send(repairText,'repair')} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Wrench size={13}/> Fix error · 0 credits</button></div>}
      <div className="flex flex-1 items-center justify-center overflow-auto p-3 sm:p-5">
        {previewUrl?<div className={'h-full min-h-[460px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg '+(viewport==='mobile'?'w-[390px] max-w-full':'w-full')}><iframe title={projectName+' live preview'} src={previewUrl} sandbox="allow-scripts allow-forms" className="h-full min-h-[460px] w-full bg-white" onError={()=>setFrameError('The preview frame could not load. Check the preview URL and build status.')}/></div>:<div className="max-w-md text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-600"><Monitor size={24}/></div><h3 className="mt-4 text-base font-semibold">Your preview will appear here</h3><p className="mt-2 text-sm leading-6 text-slate-500">Save project files and create a preview to see the running website. This workspace currently has no live preview URL.</p><button onClick={onCreatePreview} className="mt-4 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white">Create preview</button></div>}
      </div>
    </section>
  </section>;
}
