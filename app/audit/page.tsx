'use client';

import { useState, type FormEvent } from 'react';

type AuditResult = {
  error?: string;
  [key: string]: unknown;
};

export default function AuditPage() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function audit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({ error: 'The audit service returned an invalid response.' }));
      setResult(response.ok ? data : { error: data.error || 'Website audit failed.' });
    } catch {
      setResult({ error: 'The audit service is unavailable. Check your connection and retry.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-bold text-yellow-300">LEO WEBSITE AUDITOR</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">Audit a public website.</h1>
        <p className="mt-4 text-zinc-400">
          Leo checks public HTML and response security signals. Sign in to run an audit. This is a heuristic review, not a guarantee that a site is safe or malware-free.
        </p>
      </div>

      <form onSubmit={audit} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="audit-url">Website URL</label>
        <input
          id="audit-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          required
          type="url"
          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
        />
        <button disabled={loading} className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black disabled:cursor-wait disabled:opacity-60">
          {loading ? 'Auditing…' : 'Audit website'}
        </button>
      </form>

      {result && (
        <pre role="status" aria-live="polite" className="mt-8 overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
