'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type CartItem = { id: string; quantity: number; product: { id: string; slug: string; title: string; price: number; currency: string; status: string; stock_quantity: number; reserved_quantity: number } | null };
const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

export function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch('/api/store/cart', { cache: 'no-store' }); const result = await response.json().catch(() => ({})); if (!response.ok) { setError(result.error ?? 'Sign in to use your cart.'); return; } setItems(result.items ?? []); setError(''); }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  const total = useMemo(() => items.reduce((sum, item) => sum + (item.product ? Number(item.product.price) * item.quantity : 0), 0), [items]);
  async function remove(id: string) { const response = await fetch(`/api/store/cart/${id}`, { method: 'DELETE' }); if (!response.ok) { setError('Could not remove that item.'); return; } await load(); }
  async function checkout() { setBusy(true); setError(''); const response = await fetch('/api/store/checkout', { method: 'POST' }); const result = await response.json().catch(() => ({})); if (response.ok && typeof result.authorization_url === 'string') { window.location.assign(result.authorization_url); return; } setError(result.error ?? 'Checkout could not start.'); setBusy(false); }
  return <section className="mt-8 space-y-4">{error && <p role="alert" className="rounded-xl border border-rose-300/20 p-4 text-sm text-rose-100">{error}{error.includes('Sign in') && <Link className="ml-2 underline" href="/auth?next=%2Fstore%2Fcart">Sign in</Link>}</p>}{items.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-5"><div><Link href={`/store/product/${item.product?.slug ?? ''}`} className="font-semibold text-white">{item.product?.title ?? 'Unavailable listing'}</Link><p className="mt-1 text-sm text-white/55">{item.product ? money(Number(item.product.price)) : ''} · Quantity {item.quantity}</p></div><button type="button" onClick={() => void remove(item.id)} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Remove</button></article>)}{!items.length && !error && <p className="rounded-2xl border border-white/10 p-8 text-white/60">Your cart is empty. <Link href="/store" className="underline">Browse products</Link></p>}{items.length > 0 && <div className="ml-auto max-w-sm rounded-2xl border border-white/10 p-5"><p className="flex justify-between font-semibold"><span>Subtotal</span><span>{money(total)}</span></p><p className="mt-2 text-xs leading-5 text-white/50">Delivery fees are agreed with the seller and are not included.</p><button type="button" disabled={busy} onClick={() => void checkout()} className="mt-5 w-full rounded-xl bg-amber-200 px-4 py-3 font-semibold text-neutral-950 disabled:opacity-60">{busy ? 'Starting checkout…' : 'Continue to secure payment'}</button></div>}</section>;
}
