'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PRODUCT_CONDITIONS, STORE_CATEGORIES } from '@/lib/store/products';

export function NewProductForm() {
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string | number> = Object.fromEntries(form.entries()) as Record<string, string>;
    payload.price = Number(form.get('price'));

    try {
      const response = await fetch('/api/store/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setError('Sign in to submit a listing. Your details are saved only in this form until you submit.');
        else setError(typeof result.error === 'string' ? result.error : 'The listing could not be submitted. Try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('The marketplace could not be reached. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-6" role="status">
        <h2 className="text-lg font-semibold text-white">Listing submitted for review</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">Your listing is private while it is reviewed. It will appear in Store discovery only after approval.</p>
        <Link href="/store" className="mt-5 inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white">Back to LeoX Store</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-7">
      <div>
        <label htmlFor="title" className="mb-2 block text-sm font-medium text-white">Product name</label>
        <input id="title" name="title" required minLength={3} maxLength={120} className="w-full rounded-xl border border-white/10 px-4 py-3" />
      </div>
      <div>
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-white">Description</label>
        <textarea id="description" name="description" required minLength={10} maxLength={5000} rows={5} className="w-full rounded-xl border border-white/10 px-4 py-3" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="mb-2 block text-sm font-medium text-white">Category</label>
          <select id="category" name="category" required defaultValue="" className="w-full rounded-xl border border-white/10 px-4 py-3">
            <option value="" disabled>Select category</option>
            {STORE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="condition" className="mb-2 block text-sm font-medium text-white">Condition</label>
          <select id="condition" name="condition" required defaultValue="" className="w-full rounded-xl border border-white/10 px-4 py-3">
            <option value="" disabled>Select condition</option>
            {PRODUCT_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition[0].toUpperCase() + condition.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_150px]">
        <div>
          <label htmlFor="price" className="mb-2 block text-sm font-medium text-white">Price</label>
          <input id="price" name="price" type="number" required min="0.01" max="1000000000000" step="0.01" className="w-full rounded-xl border border-white/10 px-4 py-3" />
        </div>
        <div>
          <label htmlFor="currency" className="mb-2 block text-sm font-medium text-white">Currency</label>
          <input id="currency" name="currency" required minLength={3} maxLength={3} defaultValue="NGN" autoCapitalize="characters" className="w-full rounded-xl border border-white/10 px-4 py-3 uppercase" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="countryCode" className="mb-2 block text-sm font-medium text-white">Country code</label>
          <input id="countryCode" name="countryCode" required minLength={2} maxLength={2} defaultValue="NG" autoCapitalize="characters" placeholder="NG, KE, GH" className="w-full rounded-xl border border-white/10 px-4 py-3 uppercase" />
        </div>
        <div>
          <label htmlFor="region" className="mb-2 block text-sm font-medium text-white">Region or state (optional)</label>
          <input id="region" name="region" maxLength={100} className="w-full rounded-xl border border-white/10 px-4 py-3" />
        </div>
      </div>
      <div>
        <label htmlFor="city" className="mb-2 block text-sm font-medium text-white">City</label>
        <input id="city" name="city" required maxLength={100} className="w-full rounded-xl border border-white/10 px-4 py-3" />
      </div>
      {error && (
        <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100" role="alert">
          <p>{error}</p>
          {error.startsWith('Sign in') && <Link href="/auth" className="mt-3 inline-flex underline underline-offset-4">Open sign in</Link>}
        </div>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-200 px-5 py-3 font-semibold text-neutral-950 disabled:opacity-60">{busy ? 'Submitting…' : 'Submit for review'}</button>
    </form>
  );
}
