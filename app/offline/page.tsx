'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, CloudUpload, LoaderCircle, Trash2, Wifi, WifiOff } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { acknowledgeOfflineEvents, enqueueOfflineEvent, listOfflineEvents, synchronizeOfflineOutbox, type OfflineEvent } from '@/lib/offline-outbox';

function newKey() { return `offline-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
export default function OfflineWorkPage() {
  const [events, setEvents] = useState<OfflineEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [kind, setKind] = useState<'draft'|'workforce_task'>('draft');
  const [text, setText] = useState('');
  const [roleId, setRoleId] = useState('senior-full-stack-architect');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { try { setEvents(await listOfflineEvents(50)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Offline storage unavailable.'); } }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    // Refresh the persisted outbox after mount to hydrate client state from browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial hydration from IndexedDB is required for the offline queue.
    void refresh();
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [refresh]);
  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!text.trim() || busy) return; setBusy(true); setError(''); setNotice('');
    try {
      await enqueueOfflineEvent({ idempotency_key: newKey(), kind, payload: kind === 'draft' ? { text: text.trim() } : { role_id: roleId.trim(), task: text.trim(), context: context.trim() } });
      setText(''); setContext(''); setNotice('Saved on this device. Nothing was sent to the cloud.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save offline work.'); }
    finally { setBusy(false); }
  }
  async function sync() {
    if (busy) return; setBusy(true); setError(''); setNotice('Synchronizing saved outbox items…');
    try { const result = await synchronizeOfflineOutbox(); setNotice(`Sync finished: ${result.accepted} accepted or queued; ${result.rejected} rejected. Rejected items remain here until you discard or correct them.`); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sync failed. Your local queue was preserved.'); setNotice(''); }
    finally { setBusy(false); }
  }
  async function discard(key: string) { await acknowledgeOfflineEvents([key]); await refresh(); }
  return <LEOAppShell title="Offline Work" subtitle="Local outbox · explicit synchronization · idempotent delivery">
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-white">Local AI chat</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">Offline drafts work without a model. For AI answers with data disconnected, install Ollama and a local model on this computer, configure .env.local, and run LeonardX locally.</p></div><a href="/offline/chat" className="rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-bold text-black">Open Leo Local Chat</a></div><p className="mt-3 text-[11px] text-zinc-500">Setup guide: docs/OFFLINE-LOCAL-MODEL-SETUP.md · The Vercel URL itself cannot answer offline.</p></Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-white">Device outbox</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Queue drafts while offline. Owner workforce requests are only queued after you reconnect and pass server-side owner authorization.</p></div><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${online ? 'border-emerald-400/20 text-emerald-200' : 'border-amber-400/20 text-amber-200'}`}>{online ? <Wifi size={14}/> : <WifiOff size={14}/>} {online ? 'Browser online' : 'Browser offline'}</div></div>
        <form onSubmit={addEvent} className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setKind('draft')} className={`rounded-xl border px-3 py-2 text-xs ${kind === 'draft' ? 'border-[var(--gold)]/40 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-400'}`}>Save a draft</button><button type="button" onClick={() => setKind('workforce_task')} className={`rounded-xl border px-3 py-2 text-xs ${kind === 'workforce_task' ? 'border-[var(--gold)]/40 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-400'}`}>Queue owner workforce task</button></div>
          {kind === 'workforce_task' && <><label className="block text-xs text-zinc-400">Role ID<input value={roleId} onChange={e => setRoleId(e.target.value)} required maxLength={100} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/><span className="mt-1 block text-[10px] text-zinc-600">Example: senior-full-stack-architect. Owner authorization is checked again after reconnect.</span></label><label className="block text-xs text-zinc-400">Task context (optional)<textarea value={context} onChange={e => setContext(e.target.value)} maxLength={12000} rows={2} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/></label></>}
          <label className="block text-xs text-zinc-400">{kind === 'draft' ? 'Draft text' : 'Task objective'}<textarea value={text} onChange={e => setText(e.target.value)} required minLength={1} maxLength={12000} rows={4} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--gold)]/50" placeholder={kind === 'draft' ? 'Write something to keep on this device…' : 'Describe the work for the owner workforce…'}/></label>
          <div className="flex flex-wrap gap-2"><button disabled={busy || !text.trim()} className="rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50">Save locally</button><button type="button" onClick={() => void sync()} disabled={busy || !online || !events.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-200 disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <CloudUpload size={15}/>} Sync when online</button></div>
        </form>
        {(error || notice) && <div className={`mt-4 rounded-xl border p-3 text-xs ${error ? 'border-red-500/20 bg-red-500/5 text-red-200' : 'border-emerald-400/20 bg-emerald-400/5 text-emerald-100'}`}>{error || notice}</div>}
      </Panel>
      <Panel><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Saved items ({events.length})</h2><p className="mt-1 text-xs text-zinc-500">Stored in this browser using IndexedDB. Clear browser data only after syncing or exporting anything important.</p></div><button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300">Refresh</button></div>
        {!events.length ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><CheckCircle2 size={22} className="mx-auto text-zinc-600"/><p className="mt-2 text-sm text-zinc-300">Your local queue is empty.</p></div> : <div className="space-y-2">{events.map(item => <article key={item.idempotency_key} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{item.kind === 'draft' ? 'Draft' : 'Workforce task'}</span><time className="text-[10px] text-zinc-600">{new Date(item.created_at).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">{String(item.kind === 'draft' ? item.payload.text || '' : item.payload.task || '')}</p>{item.kind === 'workforce_task' && <p className="mt-1 text-[10px] text-zinc-500">Role: {String(item.payload.role_id || '')}</p>}</div><button type="button" onClick={() => void discard(item.idempotency_key)} aria-label="Discard saved item" className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-200"><Trash2 size={14}/></button></article>)}</div>}
      </Panel>
    </div>
  </LEOAppShell>;
}
