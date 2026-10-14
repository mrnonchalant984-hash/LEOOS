'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Download, ImagePlus, LoaderCircle, RefreshCw, Sparkles, Video } from 'lucide-react';
import { Panel } from '@/components/LEOAppShell';

type StudioMode = 'image' | 'edit' | 'video';
type StudioAsset = { id: string; job_id: string; kind: string; mime_type: string; url: string; url_expires_in: number };
type StudioJob = {
  id: string;
  job_type: string;
  provider: string;
  model: string;
  status: string;
  prompt: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  asset_id: string | null;
  source_asset_id: string | null;
};
type VideoResult = { job_id: string; status: string; asset_id?: string; video_url?: string | null; error?: string };

const modes: Array<{ id: StudioMode; label: string; description: string }> = [
  { id: 'image', label: 'Create image', description: 'Text-to-image · OpenAI' },
  { id: 'edit', label: 'Edit image', description: 'Image transformation · OpenAI' },
  { id: 'video', label: 'Create video', description: 'Text-to-video · Runway Gen-4.5' },
];

export default function StudioWorkspace() {
  const [mode, setMode] = useState<StudioMode>('image');
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [activeAsset, setActiveAsset] = useState<StudioAsset | null>(null);
  const previewUrl = useRef<string | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  async function fetchHistory() {
    const response = await fetch('/api/studio/history?limit=20', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Studio history could not be loaded.');
    return { jobs: (body.jobs || []) as StudioJob[], assets: (body.assets || []) as StudioAsset[] };
  }

  async function fetchCredits() {
    const response = await fetch('/api/credits', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return null;
    return Number.isSafeInteger(body.platform_credits) ? body.platform_credits as number : null;
  }

  async function loadHistory() {
    const history = await fetchHistory();
    setJobs(history.jobs);
    setAssets(history.assets);
  }

  async function loadCredits() {
    setCredits(await fetchCredits());
  }

  useEffect(() => {
    mounted.current = true;
    void Promise.all([fetchHistory(), fetchCredits()]).then(([history, balance]) => {
      if (!mounted.current) return;
      setJobs(history.jobs);
      setAssets(history.assets);
      setCredits(balance);
    }).catch(cause => {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'The studio could not be initialized.');
    });
    return () => {
      mounted.current = false;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  async function refreshAfterGeneration(assetId?: string) {
    await Promise.all([loadHistory(), loadCredits()]);
    if (!assetId) return;
    const response = await fetch(`/api/media/${encodeURIComponent(assetId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The saved result could not be opened.');
    setActiveAsset({ id: assetId, job_id: '', kind: body.mime_type?.startsWith('video/') ? 'video' : 'image', mime_type: body.mime_type, url: body.url, url_expires_in: body.url_expires_in });
  }

  async function pollVideo(jobId: string, attempt = 0): Promise<void> {
    if (attempt >= 60) {
      setStatus('This video is still processing. Reopen its status from Studio history later.');
      setBusy(false);
      return;
    }
    const response = await fetch(`/api/generate-video/status?job_id=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
    const body = await response.json() as VideoResult;
    if (!response.ok) throw new Error(body.error || 'Video status is temporarily unavailable.');
    if (body.status === 'completed' && body.asset_id) {
      setStatus('Video generation completed.');
      await refreshAfterGeneration(body.asset_id);
      setBusy(false);
      return;
    }
    if (body.status === 'failed' || body.status === 'cancelled') throw new Error(body.error || 'The video provider could not complete this job.');
    setStatus(`Runway is processing this job. Checking again in 10 seconds (${attempt + 1}/60).`);
    pollTimeout.current = setTimeout(() => {
      void pollVideo(jobId, attempt + 1).catch(cause => {
        if (!mounted.current) return;
        setError(cause instanceof Error ? cause.message : 'Video status is temporarily unavailable.');
        setBusy(false);
      });
    }, 10_000);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || prompt.trim().length < 3) return;
    setBusy(true);
    setError('');
    setStatus('');
    setActiveAsset(null);
    try {
      let response: Response;
      if (mode === 'edit') {
        if (!file) throw new Error('Choose a source image to edit.');
        const body = new FormData();
        body.set('prompt', prompt.trim());
        body.set('image', file);
        response = await fetch('/api/studio/edit-image', { method: 'POST', body, cache: 'no-store' });
      } else if (mode === 'image') {
        response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ prompt: prompt.trim() }),
          cache: 'no-store',
        });
      } else {
        response = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ prompt: prompt.trim(), duration, aspect_ratio: aspectRatio }),
          cache: 'no-store',
        });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The generation request failed.');
      if (mode === 'video' && body.job_id) {
        setStatus('Video job submitted to Runway.');
        await pollVideo(body.job_id);
      } else {
        setStatus(mode === 'edit' ? 'Edited image saved to your private media library.' : 'Image saved to your private media library.');
        await refreshAfterGeneration(body.asset_id);
        setBusy(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation is temporarily unavailable.');
      setBusy(false);
    }
  }

  async function reloadHistory() {
    setError('');
    try {
      await Promise.all([loadHistory(), loadCredits()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Studio history could not be refreshed.');
    }
  }

  function resumeVideo(jobId: string) {
    setBusy(true);
    setError('');
    setStatus('Checking the saved Runway job.');
    void pollVideo(jobId).catch(cause => {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'Video status is temporarily unavailable.');
      setBusy(false);
    });
  }

  const activeResult = activeAsset || assets.find(asset => asset.id === jobs[0]?.asset_id) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--gold)]">AI transformation studio</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Make something worth keeping.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Choose a configured provider workflow. Results and source images are saved privately to your account.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-zinc-300"><span className="block text-[10px] uppercase tracking-widest text-zinc-500">Platform credits</span><strong className="mt-1 block text-lg text-white">{credits ?? '—'}</strong></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <Panel className="p-5 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Creative mode">
            {modes.map(item => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => { setMode(item.id); setError(''); setStatus(''); }} className={`rounded-xl border px-3 py-3 text-left transition ${mode === item.id ? 'border-[var(--gold)]/50 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-400 hover:bg-white/[.04]'}`}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[10px]">{item.description}</span></button>)}
          </div>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            {mode === 'edit' && <div className="rounded-xl border border-dashed border-white/15 p-4">
              <label htmlFor="studio-image" className="flex cursor-pointer items-center gap-3 text-sm font-medium text-zinc-200"><ImagePlus size={18} className="text-[var(--gold)]"/>Choose a source photo <span className="text-xs font-normal text-zinc-500">PNG, JPEG, or WebP · up to 4 MB</span></label>
              <input id="studio-image" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const selected = event.target.files?.[0] || null;
                if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
                previewUrl.current = selected ? URL.createObjectURL(selected) : null;
                setPreview(previewUrl.current || '');
                setFile(selected);
              }} />
              {preview && <Image src={preview} alt="Selected source image preview" width={1200} height={800} unoptimized className="mt-4 max-h-72 max-w-full rounded-xl object-contain"/>}
            </div>}
            <label htmlFor="studio-prompt" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">{mode === 'edit' ? 'Describe the changes' : mode === 'video' ? 'Describe your video' : 'Describe your image'}</label>
            <textarea id="studio-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} minLength={3} maxLength={2000} rows={5} required placeholder={mode === 'edit' ? 'Describe a transformation to make while keeping the original separate…' : mode === 'video' ? 'Describe the scene, motion, and visual style…' : 'Describe the image you want to create…'} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-[var(--gold)]/50"/>
            {mode === 'video' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Duration<select value={duration} onChange={event => setDuration(Number(event.target.value))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white">{[2,3,4,5,6,7,8,9,10].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label><label className="text-xs text-zinc-400">Aspect ratio<select value={aspectRatio} onChange={event => setAspectRatio(event.target.value as 'landscape'|'portrait')} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label></div>}
            <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={busy || prompt.trim().length < 3 || (mode === 'edit' && !file)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin"/> : mode === 'video' ? <Video size={16}/> : <Sparkles size={16}/>} {busy ? 'Working…' : mode === 'edit' ? 'Edit image' : mode === 'video' ? 'Generate video' : 'Generate image'}</button><span className="text-[11px] text-zinc-500">Provider pricing can vary. Review your plan and credit balance before submitting.</span></div>
          </form>
          {status && <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-100">{status}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">{error}</p>}
        </Panel>

        <Panel className="min-h-[360px] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Latest result</h3><p className="mt-1 text-xs text-zinc-500">Private signed previews expire after one hour.</p></div><button type="button" onClick={() => void reloadHistory()} aria-label="Refresh studio history" className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white"><RefreshCw size={15}/></button></div>
          {activeResult ? <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
            {activeResult.kind === 'video' ? <video src={activeResult.url} controls playsInline preload="metadata" className="max-h-[440px] w-full rounded-lg" aria-label="Generated video"/> : <Image src={activeResult.url} alt="Generated AI artwork" width={1200} height={900} unoptimized className="max-h-[440px] w-full rounded-lg object-contain"/>}
            <a href={`/api/media/${encodeURIComponent(activeResult.id)}?download=1`} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200"><Download size={14}/> Download private result</a>
          </div> : <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center"><Sparkles size={23} className="text-zinc-600"/><p className="mt-3 text-sm text-zinc-300">Your next result will appear here.</p><p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">No preview is shown until a configured provider returns and saves a real result.</p></div>}
        </Panel>
      </div>

      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Recent generations</h3><p className="mt-1 text-xs text-zinc-500">Your latest 20 private generation jobs.</p></div><button type="button" onClick={() => void reloadHistory()} className="text-xs text-[var(--gold)] hover:underline">Refresh</button></div>
        {!jobs.length ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">No generations yet.</p> : <div className="mt-4 divide-y divide-white/5">{jobs.map(job => {
          const resultAsset = assets.find(asset => asset.id === job.asset_id);
          return <article key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-zinc-400">{job.job_type} · {job.provider}</span><span className="text-[10px] text-zinc-500">{job.status}</span></div><p className="mt-2 truncate text-xs text-zinc-300">{job.prompt}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(job.created_at).toLocaleString()}</p>{job.status === 'failed' && job.error_message && <p className="mt-1 text-xs text-red-300">{job.error_message}</p>}</div>
            <div className="flex gap-2">
              {job.job_type === 'video' && job.status === 'processing' && <button type="button" disabled={busy} onClick={() => resumeVideo(job.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:text-white disabled:opacity-50">Check status</button>}
              {resultAsset && <button type="button" onClick={() => setActiveAsset(resultAsset)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:text-white">View result</button>}
            </div>
          </article>;
        })}</div>}
      </Panel>
    </div>
  );
}
