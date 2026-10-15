'use client';

import { useEffect, useState } from 'react';

type ConsentRequest = {
  request_id: string;
  client_name: string;
  scope: string;
  account_name: string;
};

export default function McpConsentPage() {
  const [requestId, setRequestId] = useState('');
  const [consent, setConsent] = useState<ConsentRequest | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('request_id') || '';
    if (!id) {
      void Promise.resolve().then(() => setError('This authorization request is missing or invalid.'));
      return;
    }
    void Promise.resolve().then(() => setRequestId(id));
  }, []);

  useEffect(() => {
    if (!requestId) return;
    void fetch(`/api/mcp/oauth/consent?request_id=${encodeURIComponent(requestId)}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (response.status === 401) {
          setNeedsSignIn(true);
          return;
        }
        if (!response.ok) throw new Error(body.error || 'The authorization request could not be loaded.');
        setConsent(body as ConsentRequest);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'The authorization request could not be loaded.'));
  }, [requestId]);

  async function decide(approved: boolean) {
    if (busy || !requestId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/mcp/oauth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, approved }),
        cache: 'no-store',
      });
      const body = await response.json();
      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (!response.ok || typeof body.redirect_url !== 'string') throw new Error(body.error || 'The decision could not be saved.');
      window.location.assign(body.redirect_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The decision could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const signInHref = `/auth?next=${encodeURIComponent(`/mcp/authorize?request_id=${requestId}`)}`;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 py-12 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[.03] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--gold)]">LeonardX secure connection</p>
        <h1 className="mt-3 text-2xl font-bold">Connect an MCP client</h1>
        {needsSignIn ? (
          <>
            <p className="mt-4 text-sm leading-6 text-zinc-300">Sign in to review and approve this connection to your LeonardX account.</p>
            <a href={signInHref} className="mt-6 inline-flex rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black">Sign in to continue</a>
          </>
        ) : consent ? (
          <>
            <p className="mt-4 text-sm leading-6 text-zinc-300"><strong className="text-white">{consent.client_name || 'An MCP client'}</strong> is requesting access to <strong className="text-white">{consent.account_name}</strong>.</p>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Requested permission</p>
              <p className="mt-2 text-sm text-white">Read your project names, types, statuses, and progress.</p>
              <p className="mt-2 text-xs text-zinc-500">This connection cannot create, update, delete, or deploy projects.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void decide(true)} className="rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{busy ? 'Saving…' : 'Approve read-only access'}</button>
              <button type="button" disabled={busy} onClick={() => void decide(false)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-zinc-200 disabled:opacity-50">Deny</button>
            </div>
          </>
        ) : !error ? <p role="status" className="mt-5 text-sm text-zinc-400">Loading connection request…</p> : null}
        {error && <p role="alert" className="mt-5 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
      </section>
    </main>
  );
}
