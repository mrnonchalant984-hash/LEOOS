'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Heart, ShieldCheck, Sparkles } from 'lucide-react';

const amounts = [1000, 2500, 5000, 10000];
const naira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;

export default function DonatePage() {
  const [amount, setAmount] = useState(2500);
  const [customAmount, setCustomAmount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const selectedAmount = amount === 0 ? Number(customAmount) : amount;
      const response = await fetch('/api/donations/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedAmount, name, email }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.authorizationUrl !== 'string') {
        throw new Error(result.error || 'Donation checkout could not be started.');
      }
      const checkout = new URL(result.authorizationUrl);
      if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com') {
        throw new Error('The payment provider returned an unexpected checkout address.');
      }
      window.location.assign(checkout.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Donation checkout could not be started.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <section>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold)]">Support LeonardX</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-6xl">Help build more useful AI tools for everyone.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">
            LeonardX is building an AI-powered workspace for creating software, learning, and getting work done.
            Contributions help us improve the platform and make it more accessible.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
              <Sparkles className="text-[var(--gold)]" size={20} />
              <h2 className="mt-3 font-semibold">Build with care</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Support ongoing product development, reliability, and user-focused improvements.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
              <ShieldCheck className="text-[var(--gold)]" size={20} />
              <h2 className="mt-3 font-semibold">Verified payments</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Your contribution is recorded only after the server verifies it with Paystack.</p>
            </div>
          </div>
          <p className="mt-6 text-sm text-zinc-500">Donations are voluntary and do not purchase a subscription or guarantee a particular feature.</p>
        </section>

        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[.04] p-6 shadow-2xl sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--gold)]/10 text-[var(--gold)]"><Heart size={20} /></span>
            <div><h2 className="text-xl font-bold">Make a contribution</h2><p className="mt-1 text-sm text-zinc-500">Secure checkout in Nigerian Naira.</p></div>
          </div>
          <fieldset className="mt-7">
            <legend className="mb-3 text-sm font-medium text-zinc-300">Choose an amount</legend>
            <div className="grid grid-cols-2 gap-3">
              {amounts.map(value => (
                <button key={value} type="button" onClick={() => setAmount(value)}
                  aria-pressed={amount === value}
                  className={`rounded-xl border px-4 py-3 text-left font-semibold ${amount === value ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-white' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
                  {naira(value)}
                </button>
              ))}
              <button type="button" onClick={() => setAmount(0)} aria-pressed={amount === 0}
                className={`col-span-2 rounded-xl border px-4 py-3 text-left font-semibold ${amount === 0 ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-white' : 'border-white/10 bg-black/20 text-zinc-300'}`}>
                Custom amount
              </button>
            </div>
          </fieldset>
          {amount === 0 && (
            <label className="mt-4 block text-sm text-zinc-300">
              Amount in naira
              <input required min="100" max="5000000" step="1" type="number" inputMode="numeric"
                value={customAmount} onChange={event => setCustomAmount(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--gold)]" />
            </label>
          )}
          <label className="mt-4 block text-sm text-zinc-300">
            Supporter name <span className="text-zinc-500">(optional)</span>
            <input maxLength={100} value={name} onChange={event => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="mt-4 block text-sm text-zinc-300">
            Email address
            <input required maxLength={254} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--gold)]" />
          </label>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-5 py-3.5 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60">
            <Heart size={17} />{busy ? 'Preparing secure checkout…' : 'Continue to secure payment'}
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-zinc-500">Payment is handled by Paystack. We will not mark this contribution successful until payment is independently verified.</p>
          <Link href="/privacy" className="mt-3 block text-center text-xs text-zinc-500 underline underline-offset-4">Read our privacy policy</Link>
        </form>
      </div>
    </main>
  );
}
