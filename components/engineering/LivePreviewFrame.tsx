'use client';

import { useState } from 'react';
import { Monitor, Smartphone, Tablet, RefreshCw, ExternalLink } from 'lucide-react';

type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: Record<Viewport, { label: string; width: number; icon: typeof Monitor }> = {
  desktop: { label: 'Desktop', width: 1280, icon: Monitor },
  tablet: { label: 'Tablet', width: 768, icon: Tablet },
  mobile: { label: 'Mobile', width: 390, icon: Smartphone },
};

export function LivePreviewFrame({
  url,
  title = 'Live application preview',
}: {
  url: string | null;
  title?: string;
}) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [nonce, setNonce] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const active = VIEWPORTS[viewport];

  if (!url) {
    return (
      <section className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-zinc-400">
          No running preview URL is available yet. A static screenshot is not used as a substitute for a working application.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Live preview</p>
          <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
            const item = VIEWPORTS[key];
            const Icon = item.icon;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={viewport === key}
                onClick={() => setViewport(key)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  viewport === key ? 'border-[var(--gold)]/40 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-400'
                }`}
              >
                <Icon size={14} className="inline" /> <span className="ml-1">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Refresh preview"
            onClick={() => { setIframeError(false); setNonce((value) => value + 1); }}
            className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white"
          >
            <RefreshCw size={14} />
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white" aria-label="Open preview">
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-white/10 bg-zinc-950">
        <div className="mx-auto" style={{ width: Math.min(active.width, 1280) }}>
          {iframeError ? (
            <div className="grid min-h-[420px] place-items-center p-6 text-center text-sm text-zinc-400">
              The preview frame could not load. Open the URL directly or check whether the app is running.
            </div>
          ) : (
            <iframe
              key={`${url}-${nonce}-${viewport}`}
              title={title}
              src={url}
              className="min-h-[420px] w-full bg-white"
              onError={() => setIframeError(true)}
            />
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Viewport {active.width}px · This is a live preview, not a concept image.</p>
    </section>
  );
}
