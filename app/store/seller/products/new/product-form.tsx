'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PRODUCT_CONDITIONS, STORE_CATEGORIES } from '@/lib/store/products';

export function NewProductForm() {
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<'loading' | 'approved' | 'required' | 'signed-out' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    fetch('/api/store/seller/verification', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.status === 401) setVerification('signed-out');
        else if (!response.ok) setVerification('unavailable');
        else setVerification(result.verified ? 'approved' : 'required');
      })
      .catch(() => { if (active) setVerification('unavailable'); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'images')) as Record<string, string>;
    payload.price = Number(form.get('price'));
    payload.stockQuantity = Number(form.get('stockQuantity'));
    const uploadedPaths: string[] = [];

    try {
      const images = form.getAll('images').filter((value): value is File => value instanceof File && value.size > 0);
      if (images.length > 8) { setError('Upload up to 8 product images.'); return; }
      for (const image of images) {
        const upload = new FormData(); upload.set('image', image);
        const uploaded = await fetch('/api/store/images', { method: 'POST', body: upload });
        const result = await uploaded.json().catch(() => ({}));
        if (!uploaded.ok) {
          if (uploadedPaths.length) await fetch('/api/store/images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: uploadedPaths }) });
          setError(typeof result.error === 'string' ? result.error : 'An image could not be uploaded.'); return;
        }
        if (typeof result.path !== 'string') throw new Error('Image upload did not return a stored image path.');
        uploadedPaths.push(result.path);
      }
      payload.imagePaths = uploadedPaths;
      const response = await fetch('/api/store/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (uploadedPaths.length) await fetch('/api/store/images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: uploadedPaths }) });
        if (response.status === 401) setError('Sign in to submit a listing. Your details are saved only in this form until you submit.');
        else setError(typeof result.error === 'string' ? result.error : 'The listing could not be submitted. Try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      if (uploadedPaths.length) await fetch('/api/store/images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: uploadedPaths }) });
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

  if (verification !== 'approved') {
    const signedOut = verification === 'signed-out';
    return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.025] p-6 text-white">
      <h2 className="text-lg font-semibold">{verification === 'loading' ? 'Checking seller verification…' : signedOut ? 'Sign in to continue' : verification === 'required' ? 'Seller verification required' : 'Verification status unavailable'}</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">{verification === 'required' ? 'Complete the seller review before creating listings. Your listing tools will unlock after approval.' : signedOut ? 'Sign in to check your seller status and continue.' : verification === 'unavailable' ? 'We could not confirm your seller status. Please retry from the seller dashboard.' : 'Your seller status is being checked.'}</p>
      {verification === 'required' && <Link href="/store/seller#seller-verification" className="mt-5 inline-flex rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-neutral-950">Open seller verification</Link>}
      {signedOut && <Link href="/auth?mode=login&next=%2Fstore%2Fseller" className="mt-5 inline-flex rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-neutral-950">Sign in</Link>}
      {verification === 'unavailable' && <Link href="/store/seller" className="mt-5 inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white">Open seller dashboard</Link>}
    </section>;
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
      <div>
        <label htmlFor="stockQuantity" className="mb-2 block text-sm font-medium text-white">Available quantity</label>
        <input id="stockQuantity" name="stockQuantity" type="number" required min="1" max="10000" step="1" defaultValue="1" className="w-full rounded-xl border border-white/10 px-4 py-3" />
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
      <div>
        <label htmlFor="images" className="mb-2 block text-sm font-medium text-white">Product images (up to 8)</label>
        <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm" />
        <p className="mt-2 text-xs text-white/50">JPEG, PNG, or WebP images up to 2 MB each. Images are resized and compressed to WebP (700 KB maximum).</p>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100" role="alert">
          <p>{error}</p>
          {error.startsWith('Sign in') && <Link href="/auth?next=%2Fstore%2Fseller%2Fproducts%2Fnew" className="mt-3 inline-flex underline underline-offset-4">Open sign in</Link>}
        </div>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-200 px-5 py-3 font-semibold text-neutral-950 disabled:opacity-60">{busy ? 'Submitting…' : 'Submit for review'}</button>
    </form>
  );
}
