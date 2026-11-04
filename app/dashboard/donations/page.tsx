'use client';

import { useEffect, useState } from 'react';

type Donation = {
  id: string;
  supporter_name: string | null;
  email: string;
  amount: number;
  currency: string;
  transaction_reference: string;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
};
type DonationReport = { donations: Donation[]; totalVerifiedNgn: number; verifiedSupporters: number; verifiedCount: number; page: number; totalRecords: number; hasMore: boolean };

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default function DonationsAdminPage() {
  const [report, setReport] = useState<DonationReport | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: '100', page: String(page) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    fetch(`/api/admin/donations?${params}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Donation records could not be loaded.');
        if (!active) return;
        setError('');
        setReport(data as DonationReport);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Donation records could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [from, page, refreshKey, to]);

  async function exportCsv() {
    if (!report) return;
    const header = ['Name', 'Email', 'Amount', 'Currency', 'Status', 'Reference', 'Created', 'Paid'];
    const allDonations = [...report.donations];
    for (let currentPage = 1; currentPage <= Math.ceil(report.totalRecords / 100); currentPage += 1) {
      if (currentPage === report.page) continue;
      const params = new URLSearchParams({ limit: '100', page: String(currentPage) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`/api/admin/donations?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Donation export failed.');
      allDonations.push(...(result.donations || []));
    }
    const rows = allDonations.map(row => [
      row.supporter_name, row.email, row.amount, row.currency, row.payment_status,
      row.transaction_reference, row.created_at, row.paid_at,
    ]);
    const file = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([file], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'leonardx-donations.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold)]">Administration</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Donation Centre</h1><p className="mt-2 text-sm text-zinc-400">Verified totals come from confirmed Paystack transactions.</p></div>
        <button onClick={() => void exportCsv().catch(cause => setError(cause instanceof Error ? cause.message : 'Donation export failed.'))} disabled={!report?.totalRecords || loading} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Export matching records</button>
      </header>
      <section className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4">
        <label className="text-sm text-zinc-300">From<input type="date" value={from} onChange={event => { setLoading(true); setFrom(event.target.value); }} className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"/></label>
        <label className="text-sm text-zinc-300">To<input type="date" value={to} onChange={event => { setLoading(true); setTo(event.target.value); }} className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"/></label>
        <button onClick={() => { setLoading(true); setPage(1); setRefreshKey(current => current + 1); }} disabled={loading} className="rounded-lg bg-[var(--gold)] px-4 py-2.5 font-bold text-black disabled:opacity-50">{loading ? 'Loading…' : 'Apply filters'}</button>
      </section>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-red-200">{error}</p>}
      {report && <>
        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {[['Verified total', `₦${report.totalVerifiedNgn.toLocaleString('en-NG')}`], ['Verified supporters', report.verifiedSupporters.toLocaleString()], ['Verified contributions', report.verifiedCount.toLocaleString()]].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-sm text-zinc-500">{label}</p><p className="mt-3 text-2xl font-black">{value}</p></article>)}
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="font-bold">Donation records</h2><p className="mt-1 text-xs text-zinc-500">Page {report.page} · {report.totalRecords.toLocaleString()} matching records</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-zinc-500"><tr>{['Supporter', 'Amount', 'Status', 'Reference', 'Created'].map(label => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>
            {report.donations.map(row => <tr key={row.id} className="border-t border-white/[.06]"><td className="px-5 py-3"><span className="block font-semibold">{row.supporter_name || 'Anonymous supporter'}</span><span className="text-xs text-zinc-500">{row.email}</span></td><td className="px-5 py-3">₦{Number(row.amount).toLocaleString('en-NG')}</td><td className="px-5 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs ${row.payment_status === 'success' ? 'border-emerald-400/20 text-emerald-300' : 'border-white/10 text-zinc-400'}`}>{row.payment_status}</span></td><td className="px-5 py-3 font-mono text-xs">{row.transaction_reference}</td><td className="px-5 py-3 text-zinc-400">{new Date(row.created_at).toLocaleString()}</td></tr>)}
            {!report.donations.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">No donations match these dates.</td></tr>}
          </tbody></table></div>
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3"><button disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(current => current - 1); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-xs text-zinc-500">Page {page}</span><button disabled={!report.hasMore || loading} onClick={() => { setLoading(true); setPage(current => current + 1); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Next</button></div>
        </section>
      </>}
    </main>
  );
}
