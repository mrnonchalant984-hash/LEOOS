'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Account = { bank_code: string; account_name: string; account_last4: string; updated_at: string } | null;
type Payout = { order_id: string; gross_kobo: number; delivery_kobo: number; commission_kobo: number; net_kobo: number; status: string; created_at: string };
const money = (kobo: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);

export function SellerPayoutSettings({ verified }: { verified: boolean }) {
  const [account, setAccount] = useState<Account>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/store/seller/payout-account', { cache: 'no-store' }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (active && response.ok) { setAccount(result.account ?? null); setPayouts(result.payouts ?? []); }
    }).catch(() => { if (active) setError('Payout settings could not be loaded.'); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch('/api/store/seller/payout-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankCode: form.get('bankCode'), accountNumber: form.get('accountNumber'), accountName: form.get('accountName') }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Payout account could not be saved.');
      setAccount(result.account);
      setNotice('Paystack verified and saved your payout destination. The full account number is not stored by LeoX.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payout account could not be saved.');
    } finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-white/10 p-5">
    <h2 className="text-xl font-semibold">Seller payout account</h2>
    <p className="mt-2 text-sm leading-6 text-white/55">After you mark an order delivered and the buyer confirms receipt, Paystack transfers the seller’s order amount minus a 5% commission. The delivery fee is passed through to you. Transfers require Paystack transfer approval and available platform balance.</p>
    {!verified ? <p className="mt-4 text-sm text-amber-100">Complete seller verification before setting a payout account.</p> : <>
      {account && <p className="mt-4 rounded-xl border border-emerald-300/20 p-3 text-sm text-emerald-100">Saved: {account.account_name} · bank {account.bank_code} · ending {account.account_last4}</p>}
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Bank code<input required name="bankCode" minLength={2} maxLength={20} autoComplete="off" className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm">Account name<input required name="accountName" minLength={2} maxLength={120} autoComplete="name" className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm sm:col-span-2">10-digit account number<input required name="accountNumber" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="off" className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <button disabled={busy} className="rounded-xl bg-amber-200 px-4 py-3 font-semibold text-neutral-950 disabled:opacity-60 sm:col-span-2">{busy ? 'Verifying with Paystack…' : account ? 'Update payout account' : 'Verify payout account'}</button>
      </form>
    </>}
    {payouts.length > 0 && <div className="mt-5"><h3 className="font-medium">Recent seller payouts</h3><ul className="mt-2 space-y-2">{payouts.map(payout => <li key={payout.order_id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/10 p-3 text-sm"><span>{new Date(payout.created_at).toLocaleDateString()} · {payout.status}</span><span>{money(payout.net_kobo)} net · {money(payout.commission_kobo)} commission</span></li>)}</ul></div>}
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-3 text-sm ${error ? 'text-rose-200' : 'text-emerald-200'}`}>{error || notice}</p>}
  </section>;
}
