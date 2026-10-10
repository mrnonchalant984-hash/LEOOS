'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bug, Clock3, FileWarning, Radio, RefreshCw } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type EventRecord = {
  id: string;
  kind: string;
  title: string;
  severity: string;
  created_at: string;
};

export default function Observability() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/observability', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Events could not be loaded.');
      setEvents(result.events || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Events could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <LEOAppShell title="Observability" subtitle="Events, failures and execution visibility.">
      <div className="page-hero">
        <span className="mini-label">Runtime visibility</span>
        <h2>See what the system is doing.</h2>
        <p>Observability is based on recorded events. If an event source is not implemented, LEO OS does not invent it.</p>
        <div className="hero-actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="two-grid">
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <div className="panel-title">Event stream</div>
              <div className="panel-subtitle">Recent account-visible events.</div>
            </div>
            <Radio size={16} />
          </div>
          <div className="mt-3" aria-live="polite">
            {loading ? (
              <div className="text-[10px] text-zinc-600">Loading events…</div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200" role="alert">
                <p>{error}</p>
                <button className="mt-3 underline underline-offset-4" onClick={() => void load()}>Try again</button>
              </div>
            ) : events.length ? events.map((event) => (
              <div className="activity-row" key={event.id}>
                <div className="activity-dot" />
                <div className="flex-1">
                  <strong>{event.title}</strong>
                  <small>{event.kind} · {new Date(event.created_at).toLocaleString()}</small>
                </div>
                <StatusPill status={event.severity} />
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[10px] text-zinc-600">
                <Clock3 size={17} className="mx-auto mb-2" />
                No events recorded yet.
              </div>
            )}
          </div>
        </Panel>
        <Panel>
          <div className="panel-title">Failure model</div>
          <div className="data-list mt-4">
            <div className="data-card"><div className="data-icon"><Bug size={15} /></div><main><strong>Errors</strong><small>Captured from real backend events.</small></main></div>
            <div className="data-card"><div className="data-icon"><AlertTriangle size={15} /></div><main><strong>Warnings</strong><small>Operational signals without fake metrics.</small></main></div>
            <div className="data-card"><div className="data-icon"><FileWarning size={15} /></div><main><strong>Secrets</strong><small>Credentials never belong in event payloads.</small></main></div>
          </div>
        </Panel>
      </div>
    </LEOAppShell>
  );
}
