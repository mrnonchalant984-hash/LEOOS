"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Blocks, Code2, CreditCard, Sparkles } from "lucide-react";

const starters = [
  "SaaS Landing Page",
  "E-Commerce Store with Paystack",
  "Portfolio Website",
  "Booking Dashboard",
];

export function PromptFirstLanding() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      window.localStorage.setItem("leonardx_initial_prompt", value);
    } catch {
      // The prompt remains in this component for this navigation.
    }
    router.push("/auth?next=/getting-started");
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-[#171923]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-500 text-sm text-white">LX</span><span>LeonardX</span></Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600 sm:gap-7">
          <Link href="/services" className="hover:text-slate-950">Services</Link>
          <Link href="/pricing" className="hover:text-slate-950">Pricing</Link>
          <Link href="/auth" className="rounded-full bg-slate-900 px-4 py-2.5 font-semibold text-white">Sign in</Link>
        </nav>
      </header>

      <section className="relative isolate overflow-hidden px-5 pb-20 pt-16 sm:pb-28 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_12%,rgba(147,197,253,.6),transparent_35%),radial-gradient(ellipse_at_85%_30%,rgba(196,181,253,.55),transparent_38%),radial-gradient(ellipse_at_50%_100%,rgba(251,207,232,.6),transparent_42%)]"/>
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.16em] text-indigo-700 shadow-sm backdrop-blur"><Sparkles size={14}/> AI software creation workspace</span>
          <h1 className="mt-7 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Describe it. <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500 bg-clip-text text-transparent">Build it with Coder.</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">Start with an idea. LeonardX brings planning, project files, AI-assisted development and connected delivery tools into one workspace.</p>
          <form onSubmit={submit} className="mx-auto mt-9 max-w-3xl rounded-[26px] border border-white bg-white p-3 text-left shadow-[0_24px_75px_rgba(70,80,145,.15)]">
            <label htmlFor="landing-prompt" className="sr-only">Describe the website or app you want Coder to build</label>
            <textarea id="landing-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} maxLength={6000} placeholder="Describe the website or app you want Coder to build... e.g., A booking site for my bakery" className="min-h-28 w-full resize-y rounded-2xl border-0 bg-transparent px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"/>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-2 pt-3">
              <span className="text-xs text-slate-400">Your idea becomes the starting brief for Coder.</span>
              <button type="submit" disabled={!prompt.trim() || busy} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Opening workspace…" : "Start building"} <ArrowRight size={15}/></button>
            </div>
          </form>
          <div className="mt-5 flex flex-wrap justify-center gap-2">{starters.map(item => <button key={item} type="button" onClick={() => setPrompt("Build a " + item.toLowerCase() + " with a polished responsive design.")} className="rounded-full border border-white/90 bg-white/55 px-4 py-2.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white">{item}</button>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Start with a foundation</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Starter templates</h2><p className="mt-2 text-sm text-slate-500">Choose a direction, then customise it in your workspace.</p></div><Link href="/templates" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">Explore templates <ArrowRight size={15}/></Link></div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/templates" className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="grid h-40 place-items-center rounded-2xl bg-gradient-to-br from-indigo-100 via-sky-100 to-white"><Blocks size={42} className="text-indigo-500"/></div><h3 className="mt-4 font-semibold">SaaS &amp; web apps</h3><p className="mt-1 text-sm text-slate-500">Dashboards, user flows and product foundations.</p></Link>
          <Link href="/templates" className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="grid h-40 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 via-orange-50 to-white"><CreditCard size={42} className="text-rose-500"/></div><h3 className="mt-4 font-semibold">Commerce &amp; payments</h3><p className="mt-1 text-sm text-slate-500">Storefronts and Paystack-ready project starters.</p></Link>
          <Link href="/templates" className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="grid h-40 place-items-center rounded-2xl bg-gradient-to-br from-cyan-100 via-violet-100 to-white"><Code2 size={42} className="text-violet-500"/></div><h3 className="mt-4 font-semibold">Websites &amp; portfolios</h3><p className="mt-1 text-sm text-slate-500">Responsive pages and personal brand experiences.</p></Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8">
        <div className="rounded-[30px] border border-slate-200 bg-white p-7 sm:p-10"><div className="flex flex-wrap items-end justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Straightforward plans</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Transparent pricing.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Review current plans, included credits and feature access before choosing. No hidden custom-domain requirement.</p></div><Link href="/pricing" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white">View plans &amp; pricing <ArrowRight size={15}/></Link></div></div>
        <footer className="flex flex-wrap justify-between gap-4 py-8 text-xs text-slate-500"><span>© {new Date().getFullYear()} LeonardX</span><div className="flex gap-5"><Link href="/about">About</Link><Link href="/services">Services</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
      </section>
    </main>
  );
}
