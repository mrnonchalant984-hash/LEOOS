'use client';

import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type HealthState = { status: 'idle' | 'checking' | 'ok' | 'error'; checkedAt: string | null; requestId: string | null };

export function ServiceLiveness() {
  const [health, setHealth] = useState<HealthState>({ status: 'idle', checkedAt: null, requestId: null });

  async function check() {
    setHealth(current => ({ ...current, status: 'checking' }));
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      setHealth({
        status: response.ok && body.status === 'ok' ? 'ok' : 'error',
        checkedAt: new Date().toISOString(),
        requestId: response.headers.get('x-request-id'),
      });
    } catch {
      setHealth({ status: 'error', checkedAt: new Date().toISOString(), requestId: null });
    }
  }

  const statusLabel = health.status === 'idle' ? 'Not checked' : health.status === 'checking' ? 'Checking' : health.status === 'ok' ? 'Responding' : 'Unavailable';

  return <section aria-labelledby="liveness-title" className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="data-icon"><Activity size={16}/></div>
        <div>
          <h2 id="liveness-title" className="text-sm font-semibold">Application liveness</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Checks whether this web process answers HTTP. It does not test databases or external providers.</p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={() => void check()} disabled={health.status === 'checking'}>
        <RefreshCw size={14} className={health.status === 'checking' ? 'animate-spin' : ''}/>{health.status === 'checking' ? 'Checking…' : 'Check now'}
      </Button>
    </div>
    <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <span className={health.status === 'ok' ? 'text-emerald-300' : health.status === 'error' ? 'text-rose-300' : 'text-zinc-400'}>Status: {statusLabel}</span>
      {health.checkedAt && <time dateTime={health.checkedAt} className="text-zinc-500">Checked {new Date(health.checkedAt).toLocaleTimeString()}</time>}
      {health.requestId && <span className="font-mono text-zinc-600">Request {health.requestId}</span>}
    </div>
  </section>;
}
