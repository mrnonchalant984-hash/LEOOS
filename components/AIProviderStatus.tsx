'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, RefreshCw } from 'lucide-react';

type ModelStatus = { id: string; provider: string; model: string; capabilities?: string[]; configured: boolean };
type Payload = { models?: ModelStatus[]; defaults?: { chat?: string; reasoning?: string }; error?: string };

function Status({ ready }: { ready: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${ready ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>
    {ready ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>}
    {ready ? 'Credential detected · not live-tested' : 'Not configured'}
  </span>;
}

export function AIProviderStatus() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (manual = true) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (manual) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await fetch('/api/models', { cache: 'no-store', signal: controller.signal });
      const data = await response.json() as Payload;
      if (!response.ok) throw new Error(data.error || `Could not load provider status (${response.status}).`);
      if (!controller.signal.aborted) {
        setPayload(data);
        setError('');
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Could not load provider status.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    }
  }, []);

  useEffect(() => {
    // Keep the initial request inside the effect and update React state only
    // after the asynchronous fetch settles. This avoids a synchronous state
    // update in the effect body while retaining abort-on-unmount behavior.
    const controller = new AbortController();
    activeRequest.current = controller;

    async function loadInitialStatus() {
      try {
        const response = await fetch('/api/models', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json() as Payload;
        if (!response.ok) {
          throw new Error(data.error || `Could not load provider status (${response.status}).`);
        }
        if (!controller.signal.aborted) {
          setPayload(data);
          setError('');
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Could not load provider status.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (activeRequest.current === controller) activeRequest.current = null;
        }
      }
    }

    void loadInitialStatus();
    return () => {
      // Abort whichever request is active, including a manual refresh that
      // may have replaced the initial request before the component unmounts.
      activeRequest.current?.abort();
      controller.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, []);
  const models = payload?.models || [];
  const providers = [...new Set(models.map(m => m.provider))];
  const hasGoogle = models.some(m => m.provider === 'google' && m.configured);
  const hasOpenAI = models.some(m => m.provider === 'openai' && m.configured);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">AI provider status</h2><p className="mt-1 text-sm text-zinc-400">Server-reported configuration presence. This page never displays API keys.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-50">
        {loading ? <LoaderCircle size={15} className="animate-spin"/> : <RefreshCw size={15}/>} Refresh
      </button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {payload && <div className="grid gap-3 sm:grid-cols-2">
      {providers.map(provider => {
        const list = models.filter(m => m.provider === provider);
        const ready = list.some(m => m.configured);
        return <article key={provider} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold capitalize">{provider === 'google' ? 'Google Gemini' : provider}</h3><Status ready={ready}/></div>
          <p className="mt-2 text-sm text-zinc-400">{list.length} registered model option(s). Credential presence does not verify quota, billing, model access, or a successful request.</p>
          <ul className="mt-3 space-y-2 text-xs text-zinc-300">{list.slice(0, 5).map(m => <li key={m.id} className="flex justify-between gap-3"><span>{m.id}</span><span className="text-zinc-500">{m.configured ? 'configured' : 'missing'}</span></li>)}</ul>
        </article>;
      })}
    </div>}
    {payload && <article className="rounded-2xl border border-white/10 p-4">
      <h3 className="font-semibold">Active defaults</h3>
      <p className="mt-2 text-sm text-zinc-300">Chat: <code>{payload.defaults?.chat || 'not reported'}</code></p>
      <p className="mt-1 text-sm text-zinc-300">Reasoning: <code>{payload.defaults?.reasoning || 'not reported'}</code></p>
      <p className="mt-3 text-xs text-zinc-500">Gemini text fallback is eligible only when its server-side credential is configured and the primary failure is retryable. This status page does not send a test prompt or claim fallback success.</p>
    </article>}
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-sm text-amber-100">
      <div className="flex items-start gap-2"><CircleHelp size={17} className="mt-0.5 shrink-0"/><div><strong>Features are separate.</strong><p className="mt-1 text-amber-100/80">Image generation uses the configured image provider and may fall back to Imagen. Video uses the existing separately configured video integration. Real-time WebRTC currently requests an OpenAI Realtime session; Gemini turn-based voice is a separate fallback and is not the same as real-time streaming.</p></div></div>
    </div>
    {(hasGoogle || hasOpenAI) && <p className="flex items-center gap-2 text-xs text-zinc-500"><Activity size={14}/> Configuration is detected; a live provider test is still required to prove the service works.</p>}
  </section>;
}
