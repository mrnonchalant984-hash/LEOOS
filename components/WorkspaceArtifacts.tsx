"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileImage, Image as ImageIcon, Loader2, Video } from 'lucide-react';

type Artifact = { asset_id?: string | null; id?: string; kind?: string; mime_type?: string; created_at?: string; url?: string | null };

export function WorkspaceArtifacts() {
  const [items, setItems] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void (async () => { try { const response = await fetch('/api/studio/history', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Artifacts could not be loaded.'); setItems(Array.isArray(data.assets) ? data.assets : Array.isArray(data.history) ? data.history : []); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Artifacts could not be loaded.'); } finally { setLoading(false); } })(); }, []);
  if (loading) return <div className="flex min-h-[45vh] items-center justify-center text-zinc-500"><Loader2 className="animate-spin" size={18}/></div>;
  if (error) return <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>;
  if (!items.length) return <div className="flex min-h-[45vh] flex-col items-center justify-center text-center"><FileImage size={54} strokeWidth={1} className="text-zinc-400"/><h2 className="mt-6 text-lg font-medium">Make something new</h2><p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Generated images, edited media, and videos saved by Leo will appear here.</p><Link href="/app" className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">Open Leo</Link></div>;
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => { const kind = item.kind || item.mime_type || 'artifact'; const image = item.url && /^https?:\/\//.test(item.url); return <article key={item.asset_id || item.id || index} className="overflow-hidden rounded-xl border border-white/10 bg-[#151515]"><div className="flex h-44 items-center justify-center bg-[#0f0f0f] text-zinc-500">{image && item.mime_type?.startsWith('image/') ? <img src={item.url || ''} alt="Saved Leo artifact" className="h-full w-full object-cover"/> : kind.includes('video') ? <Video size={36}/> : <ImageIcon size={36}/>}</div><div className="p-4"><p className="text-sm font-medium text-zinc-200">{kind}</p><p className="mt-1 text-xs text-zinc-600">{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Saved artifact'}</p>{item.asset_id && <Link href={`/api/media/${encodeURIComponent(item.asset_id)}?download=1`} className="mt-3 inline-block text-xs text-[var(--gold)]">Open private asset</Link>}</div></article>; })}</div>;
}
