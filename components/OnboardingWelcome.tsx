'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowRight, Code2, Github, Globe2, Layers3, Sparkles, X } from 'lucide-react';

export function OnboardingWelcome() {
  const router = useRouter();
  const [open,setOpen] = useState(false);
  useEffect(() => {
    let active=true;
    (async()=>{
      const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const {data}=await supabase.auth.getUser();
      const onboarding=data.user?.user_metadata?.leonardx_onboarding as {completed_at?:string;welcome_dismissed?:boolean}|undefined;
      if(active && onboarding?.completed_at && onboarding.welcome_dismissed!==true) setOpen(true);
    })().catch(()=>{});
    return ()=>{active=false};
  },[]);
  async function dismiss(){
    setOpen(false);
    try{
      const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const {data}=await supabase.auth.getUser();
      const current=(data.user?.user_metadata?.leonardx_onboarding||{}) as Record<string,unknown>;
      await supabase.auth.updateUser({data:{leonardx_onboarding:{...current,welcome_dismissed:true}}});
    }catch{}
  }
  if(!open)return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="lx-welcome-title">
    <section className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white text-[#17151d] shadow-2xl">
      <button onClick={()=>void dismiss()} aria-label="Close welcome dialog" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"><X size={18}/></button>
      <div className="relative flex min-h-52 items-center justify-center overflow-hidden bg-[#0b0b17] text-white">
        <div className="absolute h-44 w-44 rounded-full border border-indigo-300/30 shadow-[0_0_90px_rgba(110,110,255,.35)]"/><div className="absolute h-64 w-64 rotate-12 rounded-full border border-dashed border-violet-300/20"/><div className="absolute h-80 w-80 -rotate-12 rounded-full border border-pink-300/15"/>
        <div className="relative grid h-20 w-20 place-items-center rounded-3xl border border-white/20 bg-white/10 text-3xl font-black">LX</div>
        <div className="absolute left-[14%] top-[28%] rounded-xl border border-white/15 bg-white/10 p-2"><Github size={17}/></div><div className="absolute right-[16%] top-[23%] rounded-xl border border-white/15 bg-white/10 p-2"><Globe2 size={17}/></div><div className="absolute bottom-[18%] left-[25%] rounded-xl border border-white/15 bg-white/10 p-2"><Code2 size={17}/></div><div className="absolute bottom-[17%] right-[24%] rounded-xl border border-white/15 bg-white/10 p-2"><Layers3 size={17}/></div>
        <span className="absolute bottom-4 text-[10px] tracking-[.2em] text-white/55">GITHUB · VERCEL · SUPABASE · NEXT.JS · GEMINI · PAYSTACK</span>
      </div>
      <div className="p-6 sm:p-9"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Your workspace is ready</p><h2 id="lx-welcome-title" className="mt-2 text-2xl font-bold">Bring your project into LeonardX</h2><p className="mt-3 text-sm leading-6 text-zinc-600">Import a live website as a reference or bring in a GitHub codebase. Leo can then help you plan, code, test, and deploy from one workspace.</p>
        <ul className="mt-5 space-y-3 text-sm text-zinc-700"><li className="flex gap-3"><Sparkles size={17} className="text-indigo-600"/>Import a public website reference or an existing GitHub repository</li><li className="flex gap-3"><Sparkles size={17} className="text-indigo-600"/>Bring Lovable, Bolt, and v0 projects through their GitHub export or sync route</li><li className="flex gap-3"><Sparkles size={17} className="text-indigo-600"/>Continue building, testing, and deploying with Leo</li></ul>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={()=>{void dismiss();router.push('/templates')}} className="rounded-full bg-zinc-100 px-6 py-3 text-sm font-semibold">Start from scratch</button><button onClick={()=>{void dismiss();router.push('/import-project')}} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#17151e] px-6 py-3 text-sm font-semibold text-white">Import now <ArrowRight size={16}/></button></div>
      </div>
    </section>
  </div>;
}
