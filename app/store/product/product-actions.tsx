'use client';

import { useState, type FormEvent } from 'react';

export function ProductActions({ productId }: { productId: string }) {
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    const response = await fetch('/api/store/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
    const result = await response.json().catch(() => ({})); setMessage(response.ok ? 'Product saved to your list.' : result.error ?? 'Could not save product.');
  }
  async function contact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/store/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, message: form.get('message') }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Message could not be sent.'); else setMessage('Your message was sent to the seller.');
    setBusy(false);
  }
  return <div className="mt-5 space-y-4"><button type="button" onClick={() => void save()} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Save product</button><form onSubmit={contact} className="space-y-3"><label htmlFor="seller-message" className="block text-sm font-medium text-white">Message the seller</label><textarea id="seller-message" name="message" required maxLength={4000} rows={3} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm" placeholder="Ask about availability, condition, or delivery."/><button disabled={busy} className="rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-60">{busy ? 'Sending…' : 'Send message'}</button></form>{(message || error) && <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-rose-200' : 'text-sm text-emerald-200'}>{error || message}</p>}</div>;
}
