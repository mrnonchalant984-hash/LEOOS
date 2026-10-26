"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, FolderKanban, Grid2X2, LayoutTemplate, MessageSquare, Plus, Search, Settings2, SlidersHorizontal, UserCircle } from "lucide-react";

type ChatItem = { id: string; title: string };

export function LeoWorkspaceSidebar({ active }: { active: "projects" | "artifacts" | "customize" }) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("leo_chat_sessions") || "[]");
      if (Array.isArray(stored)) setChats(stored.filter((item): item is ChatItem => Boolean(item && typeof item.id === "string" && typeof item.title === "string")).slice(0, 30));
    } catch { setChats([]); }
  }, []);

  const visibleChats = chats.filter((chat) => !query.trim() || chat.title.toLowerCase().includes(query.trim().toLowerCase()));
  const nav = [
    ["projects", "Projects", "/app/projects", FolderKanban],
    ["artifacts", "Artifacts", "/app/artifacts", Grid2X2],
    ["customize", "Customize", "/app/customize", Settings2],
  ] as const;

  return <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-[#292929] bg-[#111111] text-zinc-300">
    <div className="flex h-14 items-center gap-2 border-b border-[#242424] px-3">
      <Link href="/app" aria-label="Back to Leo chat" className="rounded-md p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"><ArrowLeft size={16}/></Link>
      <span className="text-xs font-semibold tracking-wide text-zinc-200">LEO workspace</span>
    </div>
    <div className="space-y-0.5 p-2">
      <Link href="/app" className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm text-[var(--gold)] hover:bg-white/5"><Plus size={16}/>New</Link>
      {nav.map(([key, label, href, Icon]) => <Link key={key} href={href} className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${active === key ? "bg-white/[.14] text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={16}/>{label}</Link>)}
    </div>
    <div className="px-3 pb-2 pt-4"><div className="flex items-center justify-between text-[11px] text-zinc-500"><span>Chats</span><div className="flex gap-1"><Search size={14}/><SlidersHorizontal size={14}/></div></div><label className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.025] px-2 py-1.5 text-zinc-500"><Search size={13}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600" aria-label="Search chats"/></label></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{visibleChats.length ? visibleChats.map((chat) => <Link key={chat.id} href={`/app?session_id=${encodeURIComponent(chat.id)}`} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"><MessageSquare size={13} className="shrink-0"/><span className="truncate">{chat.title}</span></Link>) : <p className="px-2.5 py-3 text-xs leading-5 text-zinc-600">Recent chats will appear here.</p>}</div>
    <div className="relative border-t border-[#292929] p-2.5"><button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5"><UserCircle size={17}/><span className="min-w-0 flex-1 truncate text-xs">Leonard <span className="text-zinc-600">· Free</span></span><ChevronDown size={14} className="text-zinc-600"/></button>{profileOpen && <div className="absolute bottom-full left-2 right-2 mb-2 rounded-xl border border-white/15 bg-[#1a1a1a] p-1.5 shadow-2xl"><Link href="/settings" className="block rounded-lg px-2.5 py-2 text-xs hover:bg-white/5">Settings</Link><Link href="/pricing" className="block rounded-lg px-2.5 py-2 text-xs hover:bg-white/5">Upgrade plan</Link><Link href="/support" className="block rounded-lg px-2.5 py-2 text-xs hover:bg-white/5">Get help</Link></div>}</div>
  </aside>;
}

export function LeoWorkspaceFrame({ active, children }: { active: "projects" | "artifacts" | "customize"; children: React.ReactNode }) {
  return <main className="flex min-h-screen overflow-hidden bg-[#0b0b0b] text-zinc-100"><LeoWorkspaceSidebar active={active}/><section className="min-w-0 flex-1 overflow-y-auto">{children}</section></main>;
}
