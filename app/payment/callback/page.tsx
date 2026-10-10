'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PaymentCallbackPage() {
  const [message, setMessage] = useState('Verifying your payment…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const isHostingRenewal = params.get('type') === 'hosting_renewal';
    let cancelled = false;

    if (!reference) {
      window.setTimeout(() => { if (!cancelled) setMessage('No payment reference was supplied.'); }, 0);
      return () => { cancelled = true; };
    }
    const paymentReference = reference;

    async function verifySubscription() {
      try {
        const response = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: paymentReference }),
          cache: 'no-store',
        });
        const data = await response.json();
        if (!cancelled) setMessage(data.ok ? 'Payment verified and your access has been updated.' : data.error || 'Payment could not be verified.');
      } catch {
        if (!cancelled) setMessage('Payment verification is temporarily unavailable. Your access will not change until the server confirms payment.');
      }
    }

    async function verifyHostingRenewal() {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          const response = await fetch(`/api/payment/hosting/status?reference=${encodeURIComponent(paymentReference)}`, { cache: 'no-store' });
          const data = await response.json();
          if (cancelled) return;
          if (data.status === 'confirmed') {
            setMessage('Hosting renewal confirmed. The saved deployment is being restored.');
            return;
          }
          if (data.status === 'failed') {
            setMessage('The hosting payment was not completed. You can try the renewal link again.');
            return;
          }
          setMessage('Waiting for Paystack to confirm the hosting payment…');
        } catch {
          if (!cancelled) setMessage('Payment confirmation is taking longer than expected. No hosting access changes until the server verifies it.');
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!cancelled) setMessage('Payment confirmation is still pending. Please refresh this page later or contact support; access changes only after server verification.');
    }

    void (isHostingRenewal ? verifyHostingRenewal() : verifySubscription());
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-4xl font-black">Payment status</h1>
      <p className="mt-5 text-zinc-400" role="status" aria-live="polite">{message}</p>
      <Link href="/account" className="mt-8 inline-block rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">
        Open my account
      </Link>
    </main>
  );
}
