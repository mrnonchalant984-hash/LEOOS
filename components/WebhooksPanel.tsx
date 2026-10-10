'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Endpoint = { id: string; url: string; description: string | null; events: string[]; created_at: string };
type Delivery = { id: string; event: string; status: string; attempts: number; response_status: number | null; last_error: string | null; created_at: string; next_attempt_at: string | null };

export function WebhooksPanel() {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState('');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const fetchEndpoints = useCallback(async () => {
    const res = await fetch('/api/developers/webhooks', { cache: 'no-store' });
    if (!res.ok) return { error: (await res.json().catch(() => ({}))).error || 'Could not load webhooks.', endpoints: [] as Endpoint[] };
    return { error: '', endpoints: (await res.json()).endpoints || [] };
  }, []);
  const load = useCallback(async () => {
    const result = await fetchEndpoints();
    setError(result.error);
    setEndpoints(result.endpoints);
  }, [fetchEndpoints]);
  useEffect(() => {
    let active = true;
    void fetchEndpoints().then(result => {
      if (!active) return;
      setError(result.error);
      setEndpoints(result.endpoints);
    });
    return () => { active = false; };
  }, [fetchEndpoints]);

  async function loadDeliveries(id: string) {
    const res = await fetch(`/api/developers/webhooks/deliveries?endpoint_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    setDeliveries(res.ok ? (await res.json()).deliveries || [] : []);
  }
  async function create() {
    setBusy('create'); setError(''); setSecret(''); setNote('');
    const res = await fetch('/api/developers/webhooks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { setError(body.error || 'Could not create the webhook.'); return; }
    setSecret(body.secret); setUrl(''); load();
  }
  async function sendTest(id: string) {
    setBusy(id); setError(''); setNote('');
    const res = await fetch('/api/developers/webhooks/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { setError(body.error || 'Test failed to send.'); return; }
    const r = body.result;
    setNote(!r ? 'No delivery was made.' : r.ok ? `Delivered. Your endpoint answered HTTP ${r.status}.` : `Delivery failed: ${r.error} It will be retried automatically.`);
    if (open === id) loadDeliveries(id);
  }
  async function remove(e: Endpoint) {
    if (!window.confirm(`Delete the webhook for ${e.url}?`)) return;
    const res = await fetch(`/api/developers/webhooks?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Could not delete.');
    load();
  }

  return <section id="webhook-endpoints" className="mt-8 scroll-mt-24 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
    <h2 className="text-xl font-bold">Webhooks</h2>
    <p className="mt-1 text-sm text-zinc-400">LEO OS sends signed HTTPS POST requests to your URL when events happen. Failed deliveries are retried with increasing delays.</p>
    {error && <div role="alert" className="mt-4 rounded-2xl border border-red-900/60 bg-black p-3 text-sm text-red-300">{error}</div>}
    {note && <div role="status" className="mt-4 rounded-2xl border border-zinc-700 bg-black p-3 text-sm text-zinc-200">{note}</div>}
    {secret && <div role="status" className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
      <p className="text-sm font-bold">Signing secret. Copy it now, it will not be shown again.</p>
      <code className="mt-2 block break-all rounded-xl bg-black p-3 text-xs text-yellow-200">{secret}</code>
    </div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/leo-webhook" aria-label="Webhook URL" className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm" />
      <Button onClick={create} disabled={busy === 'create' || !url.trim()}>{busy === 'create' ? 'Adding…' : 'Add endpoint'}</Button>
    </div>
    <p className="mt-2 text-xs text-zinc-500">HTTPS only, public hosts only. Up to 5 endpoints. Currently available event: <code>webhook.test</code>.</p>

    {endpoints === null ? <p className="mt-4 text-zinc-400">Loading…</p> : endpoints.length === 0 ? <p className="mt-4 text-zinc-400">No webhook endpoints yet.</p> : <ul className="mt-4 divide-y divide-zinc-800">
      {endpoints.map(e => <li key={e.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate font-semibold">{e.url}</p><p className="text-xs text-zinc-500">{e.events.join(', ')}</p></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => sendTest(e.id)} disabled={busy === e.id}>{busy === e.id ? 'Sending…' : 'Send test'}</Button>
            <Button variant="outline" onClick={() => { const next = open === e.id ? '' : e.id; setOpen(next); if (next) loadDeliveries(next); }}>{open === e.id ? 'Hide log' : 'View log'}</Button>
            <Button variant="outline" onClick={() => remove(e)}>Delete</Button>
          </div>
        </div>
        {open === e.id && (deliveries.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No deliveries yet.</p> : <ul className="mt-3 space-y-1 text-xs text-zinc-400">
          {deliveries.map(d => <li key={d.id}><span className={d.status === 'succeeded' ? 'text-green-400' : d.status === 'failed' ? 'text-red-400' : 'text-yellow-300'}>{d.status}</span> · {d.event} · {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'} · {d.response_status ? `HTTP ${d.response_status}` : 'no response'}{d.last_error ? ` · ${d.last_error}` : ''} · {new Date(d.created_at).toLocaleString()}</li>)}
        </ul>)}
      </li>)}
    </ul>}

    <details className="mt-5 text-sm text-zinc-400">
      <summary className="cursor-pointer font-semibold text-zinc-200">Verify signatures (Node.js)</summary>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-black p-4 text-xs text-zinc-300">{`import { createHmac, timingSafeEqual } from 'node:crypto';\n\n// header = request.headers['leo-signature']  // "t=...,v1=..."\nfunction verify(secret, header, rawBody) {\n  const p = Object.fromEntries(header.split(',').map(x => x.split('=')));\n  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;\n  const expected = createHmac('sha256', secret).update(p.t + '.' + rawBody).digest('hex');\n  return expected.length === p.v1.length &&\n    timingSafeEqual(Buffer.from(expected), Buffer.from(p.v1));\n}`}</pre>
    </details>
  </section>;
}
