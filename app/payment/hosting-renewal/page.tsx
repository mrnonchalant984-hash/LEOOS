'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function HostingRenewalPage() {
  return <Suspense fallback={<main className="min-h-screen bg-zinc-950 px-5 py-16 text-white" />}><HostingRenewalForm /></Suspense>;
}

function HostingRenewalForm() {
  const params = useSearchParams();
  const hostingId = params.get('hosting_id') || '';
  const token = params.get('token') || '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function renew() {
    setLoading(true);
    setError('');
    try {
      const callbackUrl = `${window.location.origin}/payment/callback?type=hosting_renewal`;
      const response = await fetch('/api/hosting/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosting_id: hostingId, token, callback_url: callbackUrl }),
      });
      const data = await response.json();
      if (!response.ok || !data.authorization_url) throw new Error(data.error || 'Unable to start renewal.');
      window.location.href = data.authorization_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start renewal.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-16 text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white text-xl text-zinc-950">↻</div>
        <h1 className="text-3xl font-bold">Renew your website hosting</h1>
        <p className="mt-3 text-zinc-400">Your website was temporarily placed on a renewal page because its hosting period expired.</p>
        <p className="mt-2 text-zinc-400">After Paystack confirms payment, LEO OS automatically restores the saved production deployment.</p>
        {error && <p className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
        <button disabled={!hostingId || loading} onClick={renew} className="mt-7 w-full rounded-xl bg-white px-5 py-3 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Opening secure payment…' : 'Renew hosting'}
        </button>
      </section>
    </main>
  );
}
