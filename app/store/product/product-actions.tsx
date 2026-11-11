'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export function ProductActions({ productId, productSlug, purchasable = true }: { productId: string; productSlug: string; purchasable?: boolean }) {
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    const response = await fetch('/api/store/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Could not save product.'); else { setError(''); setMessage('Product saved to your list.'); }
  }
  async function addToCart() {
    setBusy(true); setError('');
    const response = await fetch('/api/store/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, quantity: 1 }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Could not add product to cart.'); else { setError(''); setMessage('Added to your cart.'); }
    setBusy(false);
  }
  async function contact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/store/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, message: form.get('message') }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Message could not be sent.'); else { setError(''); setMessage('Your message was sent to the seller.'); }
    setBusy(false);
  }
  const authLink = `/auth?next=${encodeURIComponent(`/store/product/${productSlug}`)}`;
  return <div className="mt-5 space-y-4"><div className="flex flex-wrap gap-3">{purchasable && <button type="button" disabled={busy} onClick={() => void addToCart()} className="rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-60">Add to cart</button>}<Link href="/store/cart" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">View cart</Link><button type="button" onClick={() => void save()} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Save product</button></div><form onSubmit={contact} className="space-y-3"><label htmlFor="seller-message" className="block text-sm font-medium text-white">Message the seller</label><textarea id="seller-message" name="message" required maxLength={4000} rows={3} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm" placeholder="Ask about availability, condition, or delivery."/><button disabled={busy} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{busy ? 'Sending…' : 'Send message'}</button></form>{(message || error) && <div role={error ? 'alert' : 'status'} className={error ? 'text-sm text-rose-200' : 'text-sm text-emerald-200'}>{error || message}{error.includes('Sign in') && <Link href={authLink} className="ml-2 underline">Sign in</Link>}</div>}</div>;
}
