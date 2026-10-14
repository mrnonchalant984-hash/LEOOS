'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, Send, Trash2, WifiOff } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };
const STORAGE_KEY = 'leo-local-offline-chat-v1';

export default function OfflineChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is Message => Boolean(item) && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').slice(-40);
    } catch { /* Ignore corrupt local history; the user can start a fresh local chat. */ }
    return [];
  });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* Local history is best-effort if storage is full. */ }
  }, [messages]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }].slice(-20);
    setMessages(previous => [...previous, { role: 'user' as const, content }].slice(-40));
    setDraft(''); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/offline/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The local model request failed.');
      setMessages(previous => [...previous, { role: 'assistant' as const, content: data.reply }].slice(-40));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local chat is unavailable.');
    } finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#08090d] px-4 py-6 text-zinc-100 sm:px-6"><div className="mx-auto flex min-h-[90vh] max-w-4xl flex-col"><header className="flex items-center justify-between gap-3 border-b border-white/10 pb-4"><div><Link href="/offline" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white"><ArrowLeft size={14}/> Offline tools</Link><h1 className="mt-2 text-2xl font-black">Leo Local Chat</h1><p className="mt-1 text-xs text-zinc-500">On-device model · no hosted AI fallback · chat history stays in this browser</p></div><span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 px-3 py-1.5 text-xs text-emerald-200"><WifiOff size={13}/> Local mode</span></header><section aria-live="polite" className="flex-1 space-y-3 py-5">{!messages.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><h2 className="font-semibold">Chat without mobile data</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">This page needs the LeonardX app running locally and an installed model server such as Ollama. It cannot run through the Vercel URL with the internet disconnected.</p></div>}{messages.map((message, index) => <article key={`${index}-${message.role}`} className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl border p-4 text-sm leading-6 ${message.role === 'user' ? 'ml-auto border-amber-300/20 bg-amber-300/10' : 'mr-auto border-white/10 bg-white/[.04]'}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{message.role === 'user' ? 'You' : 'Leo · local model'}</p>{message.content}</article>)}{busy && <p className="inline-flex items-center gap-2 text-xs text-zinc-500"><LoaderCircle size={14} className="animate-spin"/> Waiting for the local model…</p>}{error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}<p className="mt-2 text-xs text-red-100/70">See <code>docs/OFFLINE-LOCAL-MODEL-SETUP.md</code> for the setup steps.</p></div>}</section><form onSubmit={send} className="sticky bottom-0 border-t border-white/10 bg-[#08090d] py-4"><label htmlFor="offline-message" className="sr-only">Message Leo offline</label><div className="flex items-end gap-2"><textarea id="offline-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={12000} rows={2} placeholder="Ask Leo something…" className="min-h-14 flex-1 resize-y rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none focus:border-amber-300/40"/><button disabled={busy || !draft.trim()} className="inline-flex h-12 items-center gap-2 rounded-xl bg-amber-300 px-4 font-bold text-black disabled:opacity-50"><Send size={15}/> Send</button></div><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[10px] text-zinc-600">Answers depend on your installed model and device performance.</p><button type="button" onClick={() => { setMessages([]); setError(''); localStorage.removeItem(STORAGE_KEY); }} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white"><Trash2 size={12}/> Clear local history</button></div></form></div></main>;
}
