"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ArrowRight, AudioLines, ChevronDown, CirclePlus, Folder, FolderKanban, Grid2X2,
  ImagePlus, Layers3, Link2, MonitorPlay, Search, Settings2, WandSparkles, Workflow,
} from "lucide-react";
import type { DashboardData } from "@/components/dashboard/types";

type Filter = "My projects" | "Recently viewed" | "LeonardX templates";
const filters: Filter[] = ["My projects", "Recently viewed", "LeonardX templates"];
const navItems = [
  { label: "New", href: "/dashboard", icon: CirclePlus, active: true },
  { label: "Search", href: "/projects", icon: Search },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Integrations", href: "/integrations", icon: Link2 },
  { label: "Automations / Skills", href: "/skills", icon: Workflow },
];

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}
function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Created just now";
  if (minutes < 60) return `Created ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Created ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Created ${days} day${days === 1 ? "" : "s"} ago`;
}

export function DashboardHome({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("Build");
  const [filter, setFilter] = useState<Filter>("My projects");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => { try { const recent = JSON.parse(localStorage.getItem("leonardx_recent_projects") || "[]"); if (Array.isArray(recent)) setRecentIds(recent.filter((id): id is string => typeof id === "string").slice(0, 20)); const saved = localStorage.getItem("leonardx-theme"); const preferred = saved === "dark" || saved === "light" ? saved : document.documentElement.dataset.theme === "dark" ? "dark" : "light"; setTheme(preferred); } catch { setTheme("light"); } }, []);
  const name = firstName(data.user.name);
  const projects = useMemo(() => data.projects.filter(project => project.project_name.toLowerCase().includes(query.toLowerCase())), [data.projects, query]);
  const visibleProjects = useMemo(() => filter === "Recently viewed" ? recentIds.map(id => projects.find(project => project.id === id)).filter((project): project is DashboardData["projects"][number] => Boolean(project)) : projects, [filter, projects, recentIds]);
  function rememberProject(id: string) { const next = [id, ...recentIds.filter(value => value !== id)].slice(0, 20); setRecentIds(next); try { localStorage.setItem("leonardx_recent_projects", JSON.stringify(next)); } catch {} }

  async function submit(nextPrompt = prompt) {
    const message = nextPrompt.trim();
    if (!message || busy) return;
    setBusy(true); setError("");
    try {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError || !auth.session) throw new Error("Your session expired. Sign in again to start a build.");
      const sessionId = crypto.randomUUID();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ session_id: sessionId, message: mode === "Plan" ? `Create a detailed implementation plan first. Do not start coding yet.\n\n${message}` : message, work_mode: mode === "Build", mode: "normal", request_id: crypto.randomUUID() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Leo could not start this request.");
      router.push(`/app?session_id=${encodeURIComponent(sessionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Leo could not start this request.");
      setBusy(false);
    }
  }

  const quickActions = [
    { label: "Create an app", icon: WandSparkles, prompt: "Build a complete Next.js web app with a polished responsive interface. Start by clarifying the product requirements and create the project files." },
    { label: "Generate image", icon: ImagePlus, prompt: "Generate an image for my project. Ask for any missing visual direction, then use the available image-generation capability." },
    { label: "Generate video", icon: MonitorPlay, prompt: "Help me create a video using the connected Google Veo video-generation workflow if it is available. Confirm the available workflow before starting." },
  ];

  return (
    <div className={`mx-auto flex min-h-screen max-w-[1720px] gap-4 p-3 sm:p-5 ${theme === "dark" ? "dark" : ""}`}>
      <aside className="hidden w-[244px] shrink-0 flex-col rounded-[26px] border border-black/[.06] bg-white p-4 shadow-sm dark:border-white/[.07] dark:bg-[#191a21] lg:flex">
        <button onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-zinc-50 dark:hover:bg-white/5">
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#171923] text-sm font-black text-white">LX</span>
          <span className="min-w-0 flex-1"><b className="block truncate text-sm">{name}'s LeonardX</b><small className="text-xs text-zinc-500">Personal workspace</small></span>
          <ChevronDown size={16} className="text-zinc-400"/>
        </button>
        {menuOpen && <div className="mt-2 rounded-xl border border-zinc-200 p-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"><p className="px-2 py-1">{data.user.email}</p><Link className="block rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-white/5" href="/account">Workspace settings</Link></div>}
        <nav className="mt-7 space-y-1">
          {navItems.map(item => { const Icon = item.icon; return <Link key={item.label} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${item.active ? "bg-[#171923] text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"}`}><Icon size={17} strokeWidth={1.8}/>{item.label}</Link>; })}
        </nav>
        <div className="mt-8 flex items-center justify-between px-2"><span className="text-[11px] font-semibold uppercase tracking-[.16em] text-zinc-400">Projects</span><Link href="/projects" className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">View all</Link></div>
        <div className="mt-3 space-y-1">
          {data.projects.slice(0,3).map((project,index)=><Link key={project.id} href={`/ide/${encodeURIComponent(project.id)}`} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-50 dark:hover:bg-white/5">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${["bg-sky-100 text-sky-700","bg-violet-100 text-violet-700","bg-orange-100 text-orange-700"][index]}`}><Folder size={15}/></span>
            <span className="min-w-0 truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{project.project_name}</span>
          </Link>)}
          {!data.projects.length && <p className="px-2 py-3 text-xs leading-5 text-zinc-400">Your recent projects will appear here.</p>}
        </div>
        <div className="mt-auto pt-5">
          <div className="overflow-hidden rounded-2xl bg-[#171923] p-3 text-white">
            <div className="flex items-center justify-between"><b className="text-xs">Share LeonardX</b><span className="rounded-full bg-gradient-to-r from-fuchsia-400 to-amber-300 px-2 py-1 text-[9px] font-bold text-[#171923]">+ BUILD CREDITS</span></div>
            <p className="mt-2 text-[11px] leading-5 text-white/65">Earn free build credits per referral.</p>
            <Link href="/referrals" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white">Invite a builder <ArrowRight size={12}/></Link>
          </div>
          <div className="mt-3 flex items-center justify-between px-2 text-[11px] text-zinc-500"><span>{data.plan} plan</span><Link href="/account" className="hover:text-zinc-900 dark:hover:text-white">Settings</Link></div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="relative min-h-[490px] overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,#bfe8ff_0%,#8aa8ff_34%,#6766d9_62%,#e9a2bd_82%,#ffb38f_100%)] px-4 pb-12 pt-9 text-[#171923] shadow-sm sm:px-8 sm:pt-12">
          <div className="pointer-events-none absolute inset-0 opacity-70" style={{backgroundImage:"radial-gradient(ellipse at 18% 10%,rgba(255,255,255,.75),transparent 35%),radial-gradient(ellipse at 80% 42%,rgba(75,65,190,.25),transparent 38%),radial-gradient(ellipse at 48% 100%,rgba(255,210,191,.65),transparent 38%)"}}/>
          <div className="relative mx-auto max-w-3xl text-center">
            <Link href="/integrations" className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-4 py-2 text-[11px] font-semibold shadow-sm backdrop-blur-xl">Add Paystack &amp; AI to your apps <ArrowRight size={13}/></Link>
            <h1 className="mt-8 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Ready to build, {name}?</h1>
            <p className="mt-3 text-sm text-[#34344b]/75">Describe what you want to make. Leo can help turn the idea into a working project.</p>
            <form onSubmit={event => { event.preventDefault(); void submit(); }} className="mt-8 rounded-[25px] border border-white/80 bg-white p-3 text-left shadow-[0_24px_80px_rgba(39,48,103,.22)]">
              <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} placeholder="Ask Leo to build a landing page or web app for..." className="min-h-[94px] w-full resize-y bg-transparent px-3 py-3 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"/>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-2 pt-3">
                <Link href="/import-project" aria-label="Import a website or project" className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50"><CirclePlus size={17}/></Link>
                <div className="flex items-center gap-2">
                  <select aria-label="Build mode" value={mode} onChange={event => setMode(event.target.value)} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 outline-none"><option>Build</option><option>Plan</option><option>Ask Leo</option></select>
                  <button type="button" onClick={() => router.push("/app")} aria-label="Open Leo voice workspace" className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50"><AudioLines size={16}/></button>
                  <button type="submit" disabled={!prompt.trim() || busy} className="rounded-full bg-[#171923] px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Starting…" : "Build"}</button>
                </div>
              </div>
            </form>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {quickActions.map(action => { const Icon = action.icon; return <button key={action.label} type="button" onClick={() => { setPrompt(action.prompt); void submit(action.prompt); }} className="inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/35 px-4 py-2.5 text-[11px] font-semibold text-[#292943] backdrop-blur-lg transition hover:bg-white/70"><Icon size={14}/>{action.label}</button>; })}
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-white/85 px-4 py-3 text-left text-xs text-red-700">{error}</p>}
          </div>
        </div>

        <section className="-mt-2 rounded-[28px] bg-white px-4 py-6 shadow-sm dark:bg-[#191a21] sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setSearchOpen(v => !v)} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-white/10 dark:text-zinc-300"><Search size={14}/>Search</button>
              {filters.map(item=><button key={item} onClick={() => setFilter(item)} aria-pressed={filter===item} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter===item?"bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white":"text-zinc-500 hover:bg-zinc-50 dark:hover:bg-white/5"}`}>{item}</button>)}
            </div>
            <Link href={filter==="LeonardX templates"?"/templates":"/projects"} className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">Browse all <ArrowRight className="ml-1 inline" size={13}/></Link>
          </div>
          {searchOpen && <div className="mt-4"><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your projects" className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5"/></div>}
          {filter==="LeonardX templates" ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[["SaaS starter","/templates"],["Commerce with Paystack","/templates"],["Portfolio site","/templates"]].map(([title,href])=><Link key={title} href={href} className="group rounded-2xl border border-zinc-200 p-4 hover:border-zinc-400 dark:border-white/10"><div className="mb-4 grid h-28 place-items-center rounded-xl bg-gradient-to-br from-sky-100 via-indigo-100 to-pink-100 text-indigo-700"><Layers3 size={30}/></div><b className="text-sm">{title}</b><p className="mt-1 text-xs text-zinc-500">Start from a LeonardX template</p></Link>)}
            </div>
          ) : (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.slice(0,6).map((project,index)=><Link onClick={() => rememberProject(project.id)} key={project.id} href={`/ide/${encodeURIComponent(project.id)}`} className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/[.025]">
                <div className={`relative grid h-36 place-items-center overflow-hidden ${["bg-gradient-to-br from-sky-100 to-blue-200","bg-gradient-to-br from-violet-100 to-fuchsia-100","bg-gradient-to-br from-orange-100 to-rose-100"][index%3]}`}><div className="absolute inset-4 rounded-xl border border-white/60 bg-white/25 shadow-inner"/><div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-zinc-700 shadow-sm"><Grid2X2 size={21}/></div></div>
                <div className="p-4"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#242638] text-[10px] font-bold text-white">{name.slice(0,1).toUpperCase()}</span><span className="truncate text-xs font-semibold">{data.user.name}</span></div><b className="mt-3 block truncate text-sm">{project.project_name}</b><p className="mt-1 text-[11px] text-zinc-500">{relativeTime(project.created_at)}</p></div>
              </Link>)}
              {!visibleProjects.length && <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 py-14 text-center dark:border-white/10"><p className="text-sm font-semibold">Your next project starts here.</p><p className="mt-2 text-xs text-zinc-500">Describe an idea above or import an existing project.</p></div>}
            </div>
          )}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-[11px] text-zinc-500"><span>{data.counts.projects} projects · {data.credits} credits</span><Link href="/settings/developer-platform" className="inline-flex items-center gap-1 hover:text-zinc-800 dark:hover:text-white"><Settings2 size={13}/> Developer Platform</Link></div>
      </section>
    </div>
  );
}
