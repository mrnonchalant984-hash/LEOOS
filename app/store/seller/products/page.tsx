'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Product = { id: string; slug: string; title: string; price: number; currency: string; status: string; created_at: string };

export default function SellerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/store/seller/products', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'Sign in to manage listings.'); return; }
    setError(''); setProducts(data.products ?? []);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function act(product: Product, action: string) {
    setBusy(product.id);
    const response = await fetch(`/api/store/seller/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? 'Listing update failed.'); else await load();
    setBusy('');
  }
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-16 text-white"><p className="text-sm text-amber-200">LeoX Store</p><h1 className="mt-3 text-3xl font-semibold">Your listings</h1><p className="mt-2 text-white/60">Manage listing availability and review status.</p><Link href="/store/seller/products/new" className="mt-6 inline-flex rounded-xl bg-amber-200 px-4 py-2.5 font-semibold text-neutral-950">Add a listing</Link>{error && <p role="alert" className="mt-6 text-rose-200">{error} <Link href="/auth" className="underline">Sign in</Link></p>}<div className="mt-8 space-y-3">{products.map((product) => <article key={product.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 p-5"><div><h2 className="font-medium">{product.title}</h2><p className="mt-1 text-sm text-white/55">{product.currency} {product.price} · {product.status.replace('_', ' ')}</p></div><div className="flex gap-2">{product.status === 'active' && <button disabled={busy === product.id} onClick={() => void act(product, 'pause')} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Pause</button>}{product.status === 'paused' && <button disabled={busy === product.id} onClick={() => void act(product, 'resume')} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Resume for review</button>}{product.status === 'active' && <button disabled={busy === product.id} onClick={() => void act(product, 'sold')} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Mark sold</button>}<Link href={`/store/product/${product.slug}`} className="rounded-lg border border-white/15 px-3 py-2 text-sm">View</Link></div></article>)}{!error && products.length === 0 && <p className="rounded-xl border border-white/10 p-6 text-white/60">No listings yet.</p>}</div></main>;
}
