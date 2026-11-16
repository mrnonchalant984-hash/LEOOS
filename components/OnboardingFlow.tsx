'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowRight, Check, Code2, Compass, Laptop, Palette, Rocket, Sparkles, Users, Building2 } from 'lucide-react';

const roles = [
  ['Founder', Rocket], ['Full-Stack Developer', Code2], ['Frontend / UI Designer', Palette], ['Product Builder', Sparkles],
  ['Agency / Freelancer', Building2], ['Indie Hacker', Laptop], ['Technical Lead', Users], ['Exploring / Other', Compass],
] as const;
const teams = [
  ['Solo Builder', 'Just me', Laptop], ['2–9 Team', 'A small team', Users], ['10–99 Company', 'A growing company', Building2],
  ['Agency / Studio', 'Client projects', Palette], ['Enterprise', 'A larger organisation', Compass],
] as const;

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [style, setStyle] = useState<'light'|'dark'>('dark');
  const [optOut, setOptOut] = useState(false);
  const [role, setRole] = useState<string>('Exploring / Other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function chooseStyle(value: 'light'|'dark') {
    setStyle(value);
    try { localStorage.setItem('leonardx-theme', value); document.documentElement.dataset.theme = value; } catch {}
  }

  async function finish(team: string) {
    setBusy(true); setError('');
    try {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error('Your session expired. Sign in again to finish onboarding.');
      const preferences = { completed_at: new Date().toISOString(), workspace_style: style, product_news_opt_out: optOut, role, team_size: team, welcome_dismissed: false };
      const { error: saveError } = await supabase.auth.updateUser({ data: { leonardx_onboarding: preferences } });
      if (saveError) throw saveError;
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Preferences could not be saved.'); setBusy(false); }
  }

  if (busy) return <main className="grid min-h-screen place-items-center bg-[#f7f5fb] text-center text-zinc-900"><div><Sparkles className="mx-auto mb-4 animate-pulse"/><h1 className="text-lg font-semibold">Initializing your LEO OS workspace...</h1><p className="mt-2 text-sm text-zinc-500">Saving your preferences.</p></div></main>;

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f7fb] px-4 py-10 text-[#181620]">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(133,137,255,.32),transparent_48%),radial-gradient(ellipse_at_50%_100%,rgba(244,169,202,.42),transparent_45%),linear-gradient(180deg,#faf9fc,#f4f2ff_58%,#fceef5)]"/>
    <section className="relative z-10 mx-auto w-full max-w-3xl">
      <header className="mb-12 flex items-center justify-center gap-3 text-xs font-black tracking-[.25em]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#191722] text-white">LX</span> LEONARDX</header>
      <div className="mb-8 text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Workspace setup · {step}/4</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{['Pick your workspace style','Stay updated with Leo','Which role fits you best?','How do you build?'][step-1]}</h1>
        <p className="mt-3 text-sm text-zinc-600">{['Choose how LEO OS looks while you build.','Choose whether you want occasional product updates.','Help Leo tailor your workspace.','Tell us how your projects are organised.'][step-1]}</p></div>
      {step===1 && <div className="grid gap-4 sm:grid-cols-2">{(['light','dark'] as const).map(value=><button key={value} onClick={()=>chooseStyle(value)} aria-pressed={style===value} className={\`rounded-3xl border-2 p-5 text-left \${style===value?'border-[#24212d] shadow-xl':'border-white bg-white/50'}\`}><div className={\`mb-4 h-36 rounded-2xl p-4 \${value==='dark'?'bg-[#171622]':'bg-white'}\`}><div className="h-2 w-16 rounded bg-indigo-400"/><div className="mt-5 grid grid-cols-[50px_1fr] gap-3"><div className="h-20 rounded bg-current opacity-10"/><div><div className="h-3 w-3/4 rounded bg-current opacity-20"/><div className="mt-3 h-12 rounded bg-current opacity-10"/></div></div></div><span className="flex items-center justify-between font-semibold capitalize">{value} workspace {style===value&&<Check size={17}/>}</span></button>)}</div>}
      {step===2 && <div className="mx-auto max-w-xl rounded-3xl border border-white bg-white/75 p-7 shadow-xl"><h2 className="font-semibold">Email preferences</h2><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-4"><input type="checkbox" checked={optOut} onChange={e=>setOptOut(e.target.checked)} className="mt-1 accent-indigo-600"/><span className="text-sm">Don’t send me product news, offers, and events.<span className="mt-2 block text-xs leading-5 text-zinc-500">Essential account, security, and deployment alerts will still arrive.</span></span></label><p className="mt-5 text-xs text-zinc-500">See our <a className="underline" href="/privacy">Privacy Policy</a>.</p></div>}
      {step===3 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{roles.map(([name,Icon])=><button key={name} onClick={()=>{setRole(name);setStep(4)}} className="flex min-h-28 flex-col justify-between rounded-2xl border border-white bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><Icon className="text-indigo-600"/><span className="text-sm font-semibold">{name}</span></button>)}</div>}
      {step===4 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{teams.map(([name,detail,Icon])=><button key={name} onClick={()=>void finish(name)} className="flex min-h-32 flex-col justify-between rounded-2xl border border-white bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg"><Icon className="text-indigo-600"/><span><b className="block text-sm">{name}</b><small className="text-xs text-zinc-500">{detail}</small></span></button>)}</div>}
      {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <footer className="mt-10 flex items-center justify-between"><button onClick={()=>setStep(v=>Math.max(1,v-1))} disabled={step===1} className="rounded-full px-5 py-3 text-sm text-zinc-600 disabled:opacity-0">Back</button>{step<3&&<button onClick={()=>setStep(v=>v+1)} className="inline-flex items-center gap-2 rounded-full bg-[#17151e] px-8 py-3 text-sm font-semibold text-white">Next <ArrowRight size={16}/></button>}{step===3&&<span className="text-xs text-zinc-500">Choose a role to continue</span>}{step===4&&<span className="text-xs text-zinc-500">Select a team size</span>}</footer>
      <div className="mt-7 flex justify-center gap-2">{[1,2,3,4].map(n=><span key={n} className={\`h-1.5 rounded-full \${n===step?'w-8 bg-[#17151e]':'w-1.5 bg-[#17151e]/20'}\`}/>)}</div>
    </section>
  </main>;
}
