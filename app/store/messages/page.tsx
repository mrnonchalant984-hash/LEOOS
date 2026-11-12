'use client';

import { useCallback, useEffect, useState } from 'react';

type Conversation = { id: string; product_id: string; buyer_id: string; seller_id: string; product?: { title?: string } | null; unreadCount: number };
type Message = { id: string; sender_id: string; body: string; created_at: string; attachmentUrl?: string | null };

export default function StoreMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [blockedByYou, setBlockedByYou] = useState(false);
  const refreshList = useCallback(async () => {
    const response = await fetch('/api/store/conversations', { cache: 'no-store' });
    if (!response.ok) { setError(response.status === 401 ? 'Sign in to view your messages.' : 'Messages are temporarily unavailable.'); return; }
    const result = await response.json(); setConversations(result.conversations ?? []); setError('');
    if (!selected && result.conversations?.[0]?.id) setSelected(result.conversations[0].id);
  }, [selected]);
  const refreshMessages = useCallback(async () => {
    if (!selected) return;
    const response = await fetch(`/api/store/conversations/${selected}/messages`, { cache: 'no-store' });
    if (!response.ok) { setError('This conversation is unavailable.'); return; }
    const result = await response.json(); setMessages(result.messages ?? []); setBlocked(Boolean(result.blocked)); setBlockedByYou(Boolean(result.blockedByYou));
  }, [selected]);
  useEffect(() => { const timer = window.setTimeout(() => { void refreshList(); }, 0); return () => window.clearTimeout(timer); }, [refreshList]);
  useEffect(() => { const timer = window.setTimeout(() => { void refreshMessages(); }, 0); return () => window.clearTimeout(timer); }, [refreshMessages]);
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!draft.trim() || !selected) return;
    const response = await fetch(`/api/store/conversations/${selected}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft }) });
    const result = await response.json(); if (!response.ok) { setError(result.error ?? 'Message could not be sent.'); return; }
    setDraft(''); await refreshMessages();
  }
  async function toggleBlock() {
    const response = await fetch(`/api/store/conversations/${selected}/block`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocked: !blockedByYou }) });
    const result = await response.json(); if (!response.ok) { setError(result.error ?? 'Block setting could not be changed.'); return; }
    setBlocked(Boolean(result.blocked)); setBlockedByYou(Boolean(result.blocked));
  }
  async function attach(file?: File) {
    if (!file || !selected) return;
    const form = new FormData(); form.set('file', file);
    const uploaded = await fetch(`/api/store/conversations/${selected}/attachments`, { method: 'POST', body: form });
    const uploadResult = await uploaded.json();
    if (!uploaded.ok) { setError(uploadResult.error ?? 'File could not be attached.'); return; }
    const sent = await fetch(`/api/store/conversations/${selected}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentPath: uploadResult.path }) });
    const sendResult = await sent.json(); if (!sent.ok) { setError(sendResult.error ?? 'Attachment could not be sent.'); return; }
    await refreshMessages();
  }
  return <main className="mx-auto max-w-6xl px-5 py-10 text-white"><p className="text-xs uppercase tracking-[.25em] text-violet-300">Marketplace</p><h1 className="mt-2 text-3xl font-semibold">Messages</h1><p className="mt-2 text-sm text-white/60">Keep product conversations on-platform. Do not share passwords or payment codes.</p>
    {error && <p role="status" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4 text-sm">{error}</p>}
    <section className="mt-6 grid min-h-[34rem] overflow-hidden rounded-2xl border border-white/10 md:grid-cols-[18rem_1fr]">
      <aside className="border-b border-white/10 p-3 md:border-b-0 md:border-r"><h2 className="p-3 text-sm font-semibold">Conversations</h2>{conversations.length === 0 && <p className="p-3 text-sm text-white/50">No conversations yet.</p>}{conversations.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className={`mb-1 w-full rounded-xl p-3 text-left text-sm ${selected === item.id ? 'bg-violet-500/20' : 'hover:bg-white/5'}`}><span className="block font-medium">{item.product?.title ?? 'Product conversation'}</span>{item.unreadCount > 0 && <span className="mt-1 block text-xs text-violet-300">{item.unreadCount} unread</span>}</button>)}</aside>
      <div className="flex min-h-[30rem] flex-col p-4">{selected ? <><div className="flex items-center justify-between border-b border-white/10 pb-3"><h2 className="font-medium">Conversation</h2><div className="flex gap-2"><button onClick={() => void fetch('/api/store/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: selected, reason: 'User safety concern' }) }).then(async response => { const result = await response.json(); setError(response.ok ? 'Report submitted for review.' : result.error ?? 'Report could not be submitted.'); })} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Report</button><button onClick={() => void toggleBlock()} className="rounded-lg border border-white/15 px-3 py-2 text-xs">{blockedByYou ? 'Unblock' : 'Block'}</button></div></div><div className="flex-1 space-y-3 overflow-y-auto py-4">{messages.map(message => <article key={message.id} className="max-w-[85%] rounded-xl bg-white/5 p-3 text-sm">{message.attachmentUrl ? <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="text-violet-300 underline">Open private attachment</a> : <p className="whitespace-pre-wrap">{message.body}</p>}<time className="mt-2 block text-[10px] text-white/40">{new Date(message.created_at).toLocaleString()}</time></article>)}</div>{blocked && <p className="rounded-lg bg-amber-900/30 p-3 text-sm text-amber-100">Messaging is blocked in this conversation.</p>}<form onSubmit={send} className="mt-3 flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} disabled={blocked} aria-label="Message" placeholder="Write a message" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm disabled:opacity-50"/><label className="cursor-pointer rounded-xl border border-white/15 px-3 py-3 text-xs">Attach<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={blocked} className="sr-only" onChange={event => { void attach(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button disabled={blocked || !draft.trim()} className="rounded-xl bg-violet-600 px-5 text-sm font-medium disabled:opacity-50">Send</button></form></> : <p className="m-auto text-sm text-white/50">Choose a conversation to read messages.</p>}</div>
    </section>
  </main>;
}
