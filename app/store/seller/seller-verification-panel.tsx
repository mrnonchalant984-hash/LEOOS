'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type VerificationRequest = {
  id: string;
  business_name: string;
  country_code: string;
  details: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
};

export function SellerVerificationPanel({ verified, businessName, countryCode }: {
  verified: boolean;
  businessName: string;
  countryCode: string;
}) {
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/store/seller/verification', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error ?? 'Seller verification status is unavailable.');
      return;
    }
    setRequest(result.requests?.[0] ?? null);
    setError('');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/store/seller/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: form.get('businessName'),
        countryCode: form.get('countryCode'),
        details: form.get('details'),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error ?? 'Verification request could not be submitted.');
      setBusy(false);
      return;
    }
    setRequest(result.request);
    setNotice('Your seller verification request was submitted for review.');
    formElement.reset();
    setBusy(false);
  }

  return <section id="seller-verification" className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-200">Seller access</p>
        <h2 className="mt-2 text-xl font-semibold">Seller verification</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Submit your storefront details for staff review. Listings, product images, and public delivery settings unlock after approval. Do not send identity documents in this form.</p>
      </div>
      <button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold">Refresh status</button>
    </div>
    {verified ? <p className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-100" role="status">Verified seller — listing and storefront tools are unlocked.</p>
      : request?.status === 'pending' ? <div className="mt-5 rounded-xl border border-amber-200/20 bg-amber-200/5 p-4"><p className="font-semibold text-amber-100">Request under review</p><p className="mt-1 text-sm text-white/60">{request.business_name} · {request.country_code}</p>{request.reviewer_note && <p className="mt-3 text-sm text-white/70">Review note: {request.reviewer_note}</p>}</div>
        : request?.status === 'approved' ? <p className="mt-5 rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm text-amber-100" role="status">Your request is approved, but seller tools are not yet enabled. Refresh the status or contact support if this continues.</p>
        : <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          {request?.status === 'rejected' && <p className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100 sm:col-span-2">The last request was not approved.{request.reviewer_note ? ` Review note: ${request.reviewer_note}` : ' You may update your details and submit again.'}</p>}
          <label className="text-sm">Business or storefront name<input required name="businessName" minLength={2} maxLength={120} defaultValue={businessName || request?.business_name || ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
          <label className="text-sm">Country code<input required name="countryCode" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" defaultValue={countryCode || request?.country_code || 'NG'} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3 uppercase" /><span className="mt-1 block text-xs text-white/45">Use your two-letter country code, such as NG or GH.</span></label>
          <label className="text-sm sm:col-span-2">Store and product details<textarea name="details" maxLength={2000} rows={4} placeholder="Tell reviewers what you sell and how your business operates." className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
          <button type="submit" disabled={busy} className="w-fit rounded-xl bg-amber-200 px-4 py-2.5 font-semibold text-neutral-950 disabled:opacity-50 sm:col-span-2">{busy ? 'Submitting…' : 'Submit for verification'}</button>
        </form>}
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-4 text-sm ${error ? 'text-rose-200' : 'text-emerald-200'}`}>{error || notice}</p>}
  </section>;
}
