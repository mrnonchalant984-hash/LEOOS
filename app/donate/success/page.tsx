'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function DonationSuccessContent() {
  const params = useSearchParams();
  const [message, setMessage] = useState('Checking payment status with Paystack…');
  const [status, setStatus] = useState<'checking' | 'pending' | 'success' | 'error'>('checking');
  const [retry, setRetry] = useState(0);
  const reference = params.get('reference') || '';
  const validReference = /^don_[a-f0-9]{32}$/i.test(reference);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!validReference) return;

    async function verifyPayment() {
      setStatus('checking');
      setMessage('Checking payment status with Paystack…');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const response = await fetch('/api/donations/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference }),
            cache: 'no-store',
            signal: controller.signal,
          });
          const result = await response.json().catch(() => ({}));
          if (!active) return;
          if (response.ok && result.ok) {
            setMessage('Thank you. Paystack confirmed your contribution.');
            setStatus('success');
            return;
          }
          if (response.status === 409 && attempt < 3) {
            setMessage('Your payment is still processing. Checking Paystack again…');
            await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
            continue;
          }
          if (response.status === 409) {
            setMessage('Paystack has not confirmed this payment yet. If you completed checkout, wait a moment and check again. We will record it only after Paystack confirms it.');
            setStatus('pending');
          } else {
            setMessage(result.error || 'We could not verify the payment right now. The contribution will be recorded only after server verification.');
            setStatus('error');
          }
          return;
        } catch {
          if (active) {
            setMessage('We could not verify the payment right now. Check again in a moment; the contribution will be recorded only after server verification.');
            setStatus('error');
          }
          return;
        }
      }
    }

    void verifyPayment();
    return () => {
      active = false;
      controller.abort();
    };
  }, [reference, validReference, retry]);

  const displayedMessage = validReference ? message : 'A valid donation reference was not provided.';
  const displayedStatus = validReference ? status : 'error';

  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full border ${displayedStatus === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-[var(--gold)]'}`}>
        <span className="text-2xl">{displayedStatus === 'success' ? '✓' : displayedStatus === 'checking' ? '…' : '!'}</span>
      </div>
      <h1 className="mt-6 text-3xl font-black">Donation payment status</h1>
      <p role="status" aria-live="polite" className="mt-4 text-zinc-300">{displayedMessage}</p>
      <div className="mt-8 flex justify-center gap-3">
        {validReference && (displayedStatus === 'pending' || displayedStatus === 'error') && (
          <button type="button" onClick={() => setRetry(value => value + 1)} className="rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black">
            Check payment again
          </button>
        )}
        <Link href="/donate" className="rounded-xl border border-white/10 px-5 py-3 font-semibold">Return to donations</Link>
        <Link href="/" className="rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black">LeonardX home</Link>
      </div>
    </main>
  );
}

export default function DonationSuccessPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-2xl px-4 py-24 text-center">Checking donation status…</main>}>
      <DonationSuccessContent />
    </Suspense>
  );
}
