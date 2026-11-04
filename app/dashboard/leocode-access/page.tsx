'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Invitation = { id: string; status: string; max_redemptions: number; redemption_count: number; expires_at: string; created_at: string };
type Participant = { id: string; user_id: string; full_name: string; email: string; status: string; created_at: string; invitation_code_id: string };
type PageData<T> = { rows: T[]; page: number; total: number; hasMore: boolean };

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default function LeoCodeAccessAdminPage() {
  const [view, setView] = useState<'codes' | 'participants'>('codes');
  const [codes, setCodes] = useState<Invitation[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(1);
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ view, page: String(page) });
      if (view === 'participants' && query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/admin/leocode-access?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Founders programme data could not be loaded.');
      if (view === 'codes') setCodes(data.rows || []);
      else setParticipants(data.rows || []);
      setTotal(Number(data.total || 0));
      setHasMore(Boolean(data.hasMore));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Founders programme data could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [page, query, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNewCodes([]);
    try {
      const response = await fetch('/api/admin/leocode-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, maxRedemptions, expiresAt: new Date(expiresAt).toISOString() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Invitation codes could not be generated.');
      setNewCodes(data.codes || []);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invitation codes could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(code: Invitation) {
    const status = code.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${status === 'inactive' ? 'Deactivate' : 'Reactivate'} this invitation code?`)) return;
    try {
      const response = await fetch('/api/admin/leocode-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: code.id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Invitation status could not be updated.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invitation status could not be updated.');
    }
  }

  async function exportParticipants() {
    const all: Participant[] = [];
    for (let current = 1; current <= Math.ceil(total / 100); current += 1) {
      const params = new URLSearchParams({ view: 'participants', page: String(current) });
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/admin/leocode-access?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Participant export failed.');
      all.push(...(data.rows || []));
    }
    const rows = [['Name', 'Email', 'Status', 'Invitation ID', 'Registered at'], ...all.map(row => [row.full_name, row.email, row.status, row.invitation_code_id, row.created_at])];
    const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'leocode-founders-participants.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold)]">Owner command centre</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">LeoCode access management</h1><p className="mt-2 text-sm text-zinc-400">Invitation codes are hashed at rest and shown only once when generated.</p></header>
      <form onSubmit={generate} className="mt-7 grid gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-5 sm:grid-cols-4">
        <label className="text-sm text-zinc-300">Codes to generate<input type="number" min="1" max="100" value={count} onChange={event => setCount(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"/></label>
        <label className="text-sm text-zinc-300">Uses per code<input type="number" min="1" max="1000" value={maxRedemptions} onChange={event => setMaxRedemptions(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"/></label>
        <label className="text-sm text-zinc-300">Expires at<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"/></label>
        <button disabled={busy} className="self-end rounded-lg bg-[var(--gold)] px-4 py-2.5 font-bold text-black disabled:opacity-50">{busy ? 'Working…' : 'Generate codes'}</button>
      </form>
      {newCodes.length > 0 && <section className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5"><h2 className="font-bold text-amber-100">Copy these codes now</h2><p className="mt-1 text-xs text-amber-100/70">Plaintext codes are not stored and will not be shown again.</p><pre className="mt-3 whitespace-pre-wrap break-all rounded-xl bg-black/30 p-4 font-mono text-sm">{newCodes.join('\n')}</pre></section>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-red-200">{error}</p>}
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <button onClick={() => { setView('codes'); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'codes' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Invitations</button>
        <button onClick={() => { setView('participants'); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'participants' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Participants</button>
        {view === 'participants' && <><input aria-label="Search participant email" placeholder="Search email" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="ml-auto rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"/><button onClick={() => void exportParticipants().catch(cause => setError(cause instanceof Error ? cause.message : 'Export failed.'))} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Export all matching</button></>}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{total.toLocaleString()} {view === 'codes' ? 'invitations' : 'participants'}</p>
      <section className="mt-3 overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-white/[.03] text-xs uppercase text-zinc-500"><tr>{(view === 'codes' ? ['Code ID', 'Status', 'Redemptions', 'Expires', 'Action'] : ['Name', 'Email', 'Status', 'Invitation ID', 'Registered']).map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>
          {view === 'codes' ? codes.map(code => <tr key={code.id} className="border-t border-white/[.06]"><td className="px-4 py-3 font-mono text-xs">{code.id}</td><td className="px-4 py-3">{new Date(code.expires_at) <= new Date() ? 'expired' : code.status}</td><td className="px-4 py-3">{code.redemption_count} / {code.max_redemptions}</td><td className="px-4 py-3 text-zinc-400">{new Date(code.expires_at).toLocaleString()}</td><td className="px-4 py-3"><button onClick={() => void changeStatus(code)} disabled={new Date(code.expires_at) <= new Date()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40">{code.status === 'active' ? 'Deactivate' : 'Activate'}</button></td></tr>)
            : participants.map(row => <tr key={row.id} className="border-t border-white/[.06]"><td className="px-4 py-3">{row.full_name}</td><td className="px-4 py-3">{row.email}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3 font-mono text-xs">{row.invitation_code_id}</td><td className="px-4 py-3 text-zinc-400">{new Date(row.created_at).toLocaleString()}</td></tr>)}
          {(view === 'codes' ? codes.length : participants.length) === 0 && <tr><td colSpan={5} className="px-4 py-9 text-center text-zinc-500">{busy ? 'Loading…' : 'No records found.'}</td></tr>}
        </tbody></table></div>
      </section>
      <div className="mt-4 flex items-center justify-between"><button disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)} className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-zinc-500">Page {page}</span><button disabled={!hasMore || busy} onClick={() => setPage(current => current + 1)} className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Next</button></div>
    </main>
  );
}
