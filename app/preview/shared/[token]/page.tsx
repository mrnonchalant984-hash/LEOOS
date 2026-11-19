'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {createBrowserClient} from '@supabase/ssr';
type Comment={id:string;body:string;status:string;created_at:string};
type Payload={share:{id:string;project_id:string;title:string;preview_url:string;allow_comments:boolean;can_apply:boolean;expires_at:string|null};comments:Comment[]};
async function accessToken(){const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);const {data}=await supabase.auth.getSession();return data.session?.access_token||'';}
export default function SharedPreviewPage(){
 const params=useParams<{token:string}>(),token=params.token;
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[comment,setComment]=useState(''),[busy,setBusy]=useState(false),[applying,setApplying]=useState('');
 async function load(){const bearer=await accessToken();const r=await fetch('/api/previews/shared/'+encodeURIComponent(token),{headers:bearer?{Authorization:'Bearer '+bearer}:{},cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Preview unavailable');setData(j);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[token]);
 async function submit(){if(!data||!comment.trim()||busy)return;setBusy(true);setError('');try{
  const r=await fetch('/api/previews/shared/'+encodeURIComponent(token)+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:comment})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Comment could not be submitted');setComment('');await load();
 }catch(e){setError(e instanceof Error?e.message:'Comment failed');}finally{setBusy(false);}}
 async function applyFeedback(id:string){if(applying)return;setApplying(id);setError('');try{
  const bearer=await accessToken();const r=await fetch('/api/previews/shared/'+encodeURIComponent(token)+'/comments/'+encodeURIComponent(id)+'/apply',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})}});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Bram could not apply feedback');await load();
 }catch(e){setError(e instanceof Error?e.message:'Bram edit failed');}finally{setApplying('');}}
 if(error&&!data)return <main className="min-h-screen grid place-items-center bg-slate-950 text-white"><p>{error}</p></main>;
 if(!data)return <main className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading shared preview…</main>;
 return <main className="min-h-screen bg-slate-950 text-white"><header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h1 className="font-semibold">{data.share.title}</h1><a className="text-sm underline" href={data.share.preview_url} target="_blank" rel="noreferrer">Open preview</a></header><div className="grid min-h-[80vh] lg:grid-cols-[1fr_320px]"><iframe title={data.share.title} src={data.share.preview_url} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-[75vh] w-full bg-white lg:h-full"/><aside className="space-y-4 border-l border-white/10 p-4"><h2 className="font-semibold">Feedback</h2>{data.comments.map(c=><article key={c.id} className="rounded-lg bg-white/5 p-3 text-sm"><p>{c.body}</p><small className="text-slate-400">{c.status}</small>{data.share.can_apply&&<button onClick={()=>void applyFeedback(c.id)} disabled={!!applying||!['open','failed'].includes(c.status)} className="mt-2 rounded-md border border-white/20 px-2 py-1 text-xs disabled:opacity-40">{applying===c.id?'Sending to Bram…':'Apply with Bram'}</button>}</article>)}{data.share.allow_comments&&<><textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={4000} placeholder="Leave feedback…" className="min-h-24 w-full rounded-lg bg-white/10 p-3 text-sm"/><button disabled={busy||!comment.trim()} onClick={()=>void submit()} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">{busy?'Submitting…':'Submit feedback'}</button></>}{error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}</aside></div></main>;
}
