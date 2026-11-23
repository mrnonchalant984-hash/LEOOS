'use client';

import { useCallback, useEffect, useState } from 'react';

type RequestRow = { id: string; seller_id: string; business_name: string; country_code: string; details: string; status: string; reviewer_note: string | null; created_at: string };
type Decision = { request_id: string; decision_source: string; outcome: string; risk_score: number; risk_signals: string[]; rationale: string; created_at: string };

export default function BravertonSellerVerificationAdminPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/store/seller-verification', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? 'Owner review queue is unavailable.'); return; }
    setRequests(result.requests ?? []); setDecisions(result.decisions ?? []); setError('');
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function decide(item: RequestRow, decision: 'approved' | 'rejected') {
    const note = notes[item.id]?.trim();
    if (!note || note.length < 3) { setError('Add a review note before deciding.'); return; }
    setBusy(item.id); setError(''); setNotice('');
    const response = await fetch('/api/admin/store/seller-verification', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: item.id, decision, note }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Review decision could not be saved.');
    else { setNotice(`Seller application ${decision}.`); await load(); }
    setBusy(''); 
  }
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 text-white sm:px-8">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-200">Braverton Market · Owner operations</p>
    <h1 className="mt-3 text-3xl font-semibold">Seller verification review</h1>
    <p className="mt-2 max-w-3xl text-sm text-white/55">Review applications escalated by Bram. Decisions require owner access and verified two-factor authentication and are written to an immutable decision audit.</p>
    <button onClick={() => void load()} className="mt-5 rounded-lg border border-white/15 px-3 py-2 text-sm">Refresh queue</button>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-4 text-sm ${error ? 'text-rose-200' : 'text-emerald-200'}`}>{error || notice}</p>}
    <section className="mt-7 space-y-4">{requests.map(item => {
      const history = decisions.filter(decision => decision.request_id === item.id);
      return <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{item.business_name}</h2><p className="mt-1 text-xs text-white/45">{item.country_code} · Seller {item.seller_id} · {new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-200/10 px-3 py-1 text-xs text-amber-100">Pending owner review</span></div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/70">{item.details || 'No business details supplied.'}</p>
        {history.map((decision,index) => <div key={decision.request_id+decision.created_at+index} className="mt-4 rounded-xl bg-white/[.04] p-3 text-xs"><p>Previous Bram decision: {decision.outcome} · risk {decision.risk_score}/100</p><p className="mt-1 text-white/50">{decision.rationale}</p></div>)}
        <label className="mt-4 block text-sm">Owner review note<textarea value={notes[item.id] ?? ''} onChange={event => setNotes(old => ({...old,[item.id]:event.target.value}))} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></label>
        <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy===item.id} onClick={() => void decide(item,'approved')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Approve seller</button><button disabled={busy===item.id} onClick={() => void decide(item,'rejected')} className="rounded-xl border border-rose-300/30 px-4 py-2.5 text-sm disabled:opacity-50">Reject application</button></div>
      </article>;
    })}{!requests.length && !error && <p className="rounded-2xl border border-white/10 p-8 text-white/55">No applications are waiting for owner review.</p>}</section>
  </main>;
}
