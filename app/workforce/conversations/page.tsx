'use client';
import { authFetch } from '@/lib/client-auth';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Bot, LoaderCircle, MessageCircle, Plus, Search, Send, ShieldCheck, UserRound, Volume2 } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type Role = { id: string; name: string; department: string; description: string };
type Conversation = { id: string; role_id: string; role_name: string; title: string; status: string; created_at: string; updated_at: string };
type ChatMessage = { id: string; role_id: string; speaker: 'user'|'assistant'|'system'; content: string; created_at: string };

export default function WorkforceConversationsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roleId, setRoleId] = useState('principal-software-architect');
  const [roleSearch, setRoleSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [speakingId, setSpeakingId] = useState('');

  const filteredRoles = useMemo(() => roles.filter(role => `${role.name} ${role.department}`.toLowerCase().includes(roleSearch.toLowerCase())), [roles, roleSearch]);
  const loadConversationList = useCallback(async () => {
    const response = await authFetch('/api/workforce/conversations', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Conversations could not be loaded.');
    setConversations(data.conversations || []);
    return (data.conversations || []) as Conversation[];
  }, []);
  const loadMessages = useCallback(async (conversation: Conversation) => {
    const response = await authFetch(`/api/workforce/conversations/${conversation.id}/messages`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Conversation history could not be loaded.');
    setSelected(data.conversation); setMessages(data.messages || []);
  }, []);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      setLoading(true); setError('');
      try {
        const [workforceResponse, items] = await Promise.all([authFetch('/api/workforce', { cache: 'no-store' }), loadConversationList()]);
        const data = await workforceResponse.json(); if (!workforceResponse.ok) throw new Error(data.error || 'Role catalog could not be loaded.');
        if (!alive) return;
        setRoles(data.role_catalog || []);
        if (data.role_catalog?.length) setRoleId(current => data.role_catalog.some((role: Role) => role.id === current) ? current : data.role_catalog[0].id);
        if (items[0]) await loadMessages(items[0]);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Direct chat could not be initialized.'); }
      finally { if (alive) setLoading(false); }
    };
    const timer = window.setTimeout(() => { void initialize(); }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [loadConversationList, loadMessages]);

  async function startConversation() {
    if (busy || !roleId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await authFetch('/api/workforce/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_id: roleId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Conversation could not be created.');
      const conversation = data.conversation as Conversation;
      await loadConversationList(); await loadMessages(conversation); setNotice(`Started a private conversation with ${conversation.role_name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Conversation could not be created.'); }
    finally { setBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !draft.trim() || busy) return;
    const content = draft.trim(); setDraft(''); setBusy(true); setError(''); setNotice('Sending your message and waiting for the engineer response…');
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role_id: selected.role_id, speaker: 'user', content, created_at: new Date().toISOString() };
    setMessages(current => [...current, optimistic]);
    let userMessageSaved = false;
    try {
      const response = await authFetch(`/api/workforce/conversations/${selected.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: content }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.user_message_saved) { userMessageSaved = true; await loadMessages(selected); }
        throw new Error(data.error || 'Engineer response failed.');
      }
      await loadMessages(selected); await loadConversationList(); setNotice(`Response received from ${selected.role_name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Engineer response failed. Your message may already be saved.'); if (!userMessageSaved) setDraft(content); }
    finally { setBusy(false); }
  }

  function speak(message: ChatMessage) {
    if (!('speechSynthesis' in window)) { setError('Browser speech is not supported on this device.'); return; }
    if (speakingId === message.id) { window.speechSynthesis.cancel(); setSpeakingId(''); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.onend = () => setSpeakingId(''); utterance.onerror = () => setSpeakingId('');
    setSpeakingId(message.id); window.speechSynthesis.speak(utterance);
  }

  return <LEOAppShell title="Engineer conversations" subtitle="Private, persistent one-to-one conversations with role-defined AI specialists.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold)]/[.06] p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--gold)]/10 text-[var(--gold)]"><MessageCircle size={21}/></div><div><p className="text-sm font-bold">Talk directly to an AI engineer</p><p className="mt-1 text-xs text-zinc-400">Responses use role-specific instructions and persist to your account. No repository or shell tools are implied.</p></div></div><a href="/workforce" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"><ArrowLeft size={14}/> Workforce</a></div>
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={`mb-4 rounded-xl border p-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/[.04] text-zinc-300'}`}>{error || notice}<button className="float-right" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    {loading ? <Panel><div className="flex items-center gap-2 text-sm text-zinc-400"><LoaderCircle size={16} className="animate-spin"/> Loading conversations…</div></Panel> : <div className="grid min-h-[650px] gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col"><h2 className="text-sm font-semibold">Start a conversation</h2><label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={14} className="text-zinc-500"/><input value={roleSearch} onChange={event => setRoleSearch(event.target.value)} placeholder="Find an engineer" className="w-full bg-transparent py-2 text-xs outline-none"/></label><select value={roleId} onChange={event => setRoleId(event.target.value)} size={7} className="mt-2 min-h-36 w-full rounded-xl border border-white/10 bg-[#101014] p-2 text-xs text-zinc-200">{filteredRoles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.department}</option>)}</select><button onClick={() => void startConversation()} disabled={busy || !roleId} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-3 py-2.5 text-xs font-bold text-black disabled:opacity-50"><Plus size={14}/> New conversation</button><div className="my-4 border-t border-white/10"/><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">Recent conversations</h3><span className="text-[10px] text-zinc-600">{conversations.length}</span></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{conversations.map(conversation => <button key={conversation.id} onClick={() => void loadMessages(conversation).catch(cause => setError(cause.message))} className={`w-full rounded-xl border p-3 text-left ${selected?.id === conversation.id ? 'border-[var(--gold)]/35 bg-[var(--gold)]/[.06]' : 'border-white/10 hover:bg-white/[.03]'}`}><div className="flex items-start gap-2"><Bot size={15} className="mt-0.5 shrink-0 text-[var(--gold)]"/><span className="min-w-0"><span className="block truncate text-xs font-semibold text-zinc-200">{conversation.role_name}</span><span className="mt-1 block truncate text-[10px] text-zinc-500">{conversation.title}</span><span className="mt-1 block text-[10px] text-zinc-600">{new Date(conversation.updated_at).toLocaleString()}</span></span></div></button>)}{!conversations.length && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-zinc-600">No conversations yet.</p>}</div></Panel>
      <Panel className="flex min-h-[600px] min-w-0 flex-col !p-0">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--gold)]/10 text-[var(--gold)]"><Bot size={19}/></div><div><h2 className="text-sm font-semibold">{selected.role_name}</h2><p className="mt-1 text-[10px] text-zinc-500">{roles.find(role => role.id === selected.role_id)?.department || 'Specialist role'}</p></div></div><div className="flex items-center gap-2"><StatusPill status={selected.status}/><span className="hidden items-center gap-1 text-[10px] text-zinc-600 sm:inline-flex"><ShieldCheck size={12}/> Private to your account</span></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map(message => <article key={message.id} className={`flex gap-3 ${message.speaker === 'user' ? 'flex-row-reverse' : ''}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${message.speaker === 'user' ? 'bg-white/10 text-zinc-300' : 'bg-[var(--gold)]/10 text-[var(--gold)]'}`}>{message.speaker === 'user' ? <UserRound size={15}/> : <Bot size={15}/>}</div><div className={`max-w-[88%] rounded-2xl border p-3 ${message.speaker === 'user' ? 'border-white/10 bg-white/[.04]' : 'border-[var(--gold)]/10 bg-black/20'}`}><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold text-zinc-400">{message.speaker === 'user' ? 'You' : selected.role_name}</p>{message.speaker === 'assistant' && <button onClick={() => speak(message)} className="inline-flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-200"><Volume2 size={12}/>{speakingId === message.id ? 'Stop' : 'Listen'}</button>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{message.content}</p><p className="mt-2 text-right text-[9px] text-zinc-600">{new Date(message.created_at).toLocaleString()}</p></div></article>)}{busy && <div className="flex items-center gap-2 text-xs text-zinc-500"><LoaderCircle size={14} className="animate-spin"/> Engineer is responding…</div>}{!messages.length && <div className="flex h-full min-h-60 flex-col items-center justify-center text-center"><Bot size={32} className="text-zinc-600"/><p className="mt-3 text-sm text-zinc-300">Start with a clear objective</p><p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">The selected specialist will answer from its defined responsibilities. The chat does not silently perform repository or external actions.</p></div>}</div><form onSubmit={sendMessage} className="border-t border-white/10 p-3"><div className="flex items-end gap-2"><textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={12000} placeholder={`Message ${selected.role_name}…`} className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-[var(--gold)]/50"/><button disabled={busy || !draft.trim()} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--gold)] px-4 text-sm font-bold text-black disabled:opacity-50"><Send size={15}/> Send</button></div><p className="mt-2 text-[10px] text-zinc-600">Model responses may be incorrect. Verify technical advice before making consequential changes.</p></form></> : <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><MessageCircle size={30} className="text-zinc-600"/><h2 className="mt-3 text-lg font-bold">Choose an engineer</h2><p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">Select a role and create a conversation. Previous conversations are saved in your account.</p></div>}</Panel>
    </div>}
  </LEOAppShell>;
}
