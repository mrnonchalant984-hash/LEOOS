'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ExternalLink, Monitor, RefreshCw, Smartphone } from 'lucide-react';

type PreviewJob = {
  id: string;
  status: 'queued' | 'running' | 'deployed' | 'failed';
  branch_name?: string;
  deployment_url?: string | null;
  error_code?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

async function getAccessToken() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export function BramWorkspacePreview({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [preview, setPreview] = useState<PreviewJob | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  const refresh = useCallback(async () => {
    const accessToken = await getAccessToken();
    const response = await fetch(`/api/workspaces/${encodeURIComponent(projectId)}/preview`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Preview status could not be loaded.');
    setPreview(data.preview || null);
    setError('');
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void refresh().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Preview status could not be loaded.');
    });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (preview?.status !== 'queued' && preview?.status !== 'running') return;
    const interval = window.setInterval(() => {
      void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Preview status could not be loaded.'));
    }, 5000);
    return () => window.clearInterval(interval);
  }, [preview?.status, refresh]);

  async function createPreview() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/workspaces/${encodeURIComponent(projectId)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Preview could not be created.');
      setPreview(data.preview || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview could not be created.');
    } finally {
      setBusy(false);
    }
  }

  const pending = preview?.status === 'queued' || preview?.status === 'running';
  const url = preview?.status === 'deployed' ? preview.deployment_url : null;

  return (
    <aside className="flex min-h-[380px] min-w-0 flex-col border-t border-white/10 bg-[#f1f3f7] text-slate-900 lg:min-h-0 lg:w-[46%] lg:border-l lg:border-t-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-indigo-500">Live workspace</p>
          <h2 className="truncate text-sm font-semibold">{projectName} · Preview</h2>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setViewport('desktop')} aria-pressed={viewport === 'desktop'} aria-label="Desktop preview" className={'rounded-lg p-2 ' + (viewport === 'desktop' ? 'bg-slate-100' : 'text-slate-400')}><Monitor size={15}/></button>
          <button type="button" onClick={() => setViewport('mobile')} aria-pressed={viewport === 'mobile'} aria-label="Mobile preview" className={'rounded-lg p-2 ' + (viewport === 'mobile' ? 'bg-slate-100' : 'text-slate-400')}><Smartphone size={15}/></button>
          <button type="button" onClick={() => void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Preview status could not be loaded.'))} aria-label="Refresh preview status" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw size={15}/></button>
          {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open preview in a new tab" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ExternalLink size={15}/></a>}
        </div>
      </header>
      {error && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{error}</div>}
      <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto p-3 sm:p-4">
        {url ? (
          <div className={'h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg ' + (viewport === 'mobile' ? 'w-[390px] max-w-full' : 'w-full')}>
            <iframe title={projectName + ' live preview'} src={url} loading="lazy" sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-full min-h-[320px] w-full bg-white"/>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600"><Monitor size={22}/></div>
            <h3 className="mt-4 text-sm font-semibold">{pending ? 'Preparing your preview' : preview?.status === 'failed' ? 'Preview build failed' : 'Preview your project here'}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {pending
                ? 'The preview worker is processing your saved project. This panel will refresh automatically.'
                : 'The current preview service publishes prebuilt static HTML, CSS and JavaScript. A dynamic Next.js/server runtime is not yet enabled.'}
            </p>
            {!pending && <button type="button" onClick={() => void createPreview()} disabled={busy} className="mt-4 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Queueing…' : 'Create static preview'}</button>}
          </div>
        )}
      </div>
      <footer className="border-t border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">
        {pending ? 'Build status: ' + preview?.status : preview?.status ? 'Build status: ' + preview.status : 'Preview runs in a sandboxed frame without same-origin access.'}
      </footer>
    </aside>
  );
}
