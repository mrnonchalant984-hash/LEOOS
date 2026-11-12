'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Order = { id: string; order_number: string; status: string; currency: string; created_at: string; buyer_id: string; total_kobo: number };
type Fulfillment = { status: string; method: string; courier_name: string | null; tracking_reference: string | null; tracking_url: string | null; delivery_notes: string; issue_details: string | null; buyer_confirmed_at: string | null } | null;
type Row = { order_id: string; title: string; quantity: number; line_total_kobo: number; order: Order | Order[]; fulfillment: Fulfillment; delivery: { name: string; details: string; fee_kobo: number } | null };
type Group = { order: Order; rows: Row[]; fulfillment: Fulfillment; delivery: Row['delivery'] };

const money = (kobo: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);

export function SellerOrdersClient() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/store/seller/orders', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? 'Seller orders are unavailable.'); return; }
    const map = new Map<string, Group>();
    for (const row of result.orders as Row[]) {
      const order = Array.isArray(row.order) ? row.order[0] : row.order;
      if (!order) continue;
      const group = map.get(order.id) ?? { order, rows: [], fulfillment: row.fulfillment, delivery: row.delivery };
      group.rows.push(row);
      if (row.fulfillment) group.fulfillment = row.fulfillment;
      if (row.delivery) group.delivery = row.delivery;
      map.set(order.id, group);
    }
    setGroups([...map.values()]); setError('');
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>, orderId: string) {
    event.preventDefault(); setBusy(orderId); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/store/seller/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId, status: form.get('status'), method: form.get('method'),
        courierName: form.get('courierName'), trackingReference: form.get('trackingReference'),
        trackingUrl: form.get('trackingUrl'), deliveryNotes: form.get('deliveryNotes'),
        issueDetails: form.get('issueDetails'),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Fulfillment update failed.');
    else await load();
    setBusy('');
  }

  return <><Link href="/store/seller" className="text-sm text-white/55">← Seller dashboard</Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-amber-200">LeoX Store · Seller workspace</p>
    <h1 className="mt-2 text-3xl font-semibold">Orders and delivery</h1>
    <p className="mt-2 text-sm leading-6 text-white/55">Arrange delivery with your buyer, then enter the courier and tracking details. Seller payout starts only after the buyer confirms receipt.</p>
    {error && <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p>}
    <div className="mt-8 space-y-4">{groups.map(group => <article key={group.order.id} className="rounded-2xl border border-white/10 p-5">
      <header className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{group.order.order_number}</h2><p className="text-xs text-white/50">{new Date(group.order.created_at).toLocaleString()} · {group.order.status.replaceAll('_', ' ')}</p></div><span className="text-sm text-amber-100">{group.delivery?.name ?? 'Delivery'} · {money(group.delivery?.fee_kobo ?? 0)}</span></header>
      <ul className="mt-4 space-y-2 text-sm text-white/70">{group.rows.map((row, index) => <li key={`${row.order_id}-${index}`} className="flex justify-between gap-3"><span>{row.title} × {row.quantity}</span><span>{money(row.line_total_kobo)}</span></li>)}</ul>
      <p className="mt-3 text-xs text-white/45">Buyer ID {group.order.buyer_id}</p>
      {group.fulfillment?.buyer_confirmed_at && <p className="mt-3 text-sm text-emerald-200">Buyer confirmed receipt · payout {group.fulfillment.status === 'delivered' ? 'is being processed' : 'status available in seller payouts'}.</p>}
      {['paid', 'cancellation_requested'].includes(group.order.status) && <form onSubmit={event => void save(event, group.order.id)} className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
        <label className="text-sm">Delivery status<select name="status" defaultValue={group.fulfillment?.status ?? 'processing'} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3"><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered — buyer confirmation required for payout</option><option value="delivery_issue">Delivery issue</option><option value="cancelled">Cancelled</option></select></label>
        <label className="text-sm">Method<select name="method" defaultValue={group.fulfillment?.method ?? 'seller_delivery'} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3"><option value="seller_delivery">Seller arranged</option><option value="courier">Courier</option><option value="pickup">Pickup</option></select></label>
        <label className="text-sm">Courier/provider name<input name="courierName" maxLength={100} defaultValue={group.fulfillment?.courier_name ?? ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm">Tracking reference<input name="trackingReference" maxLength={200} defaultValue={group.fulfillment?.tracking_reference ?? ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm sm:col-span-2">HTTPS tracking link<input name="trackingUrl" type="url" pattern="https://.*" maxLength={1000} defaultValue={group.fulfillment?.tracking_url ?? ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm sm:col-span-2">Delivery notes<textarea name="deliveryNotes" maxLength={2000} rows={2} defaultValue={group.fulfillment?.delivery_notes ?? ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <label className="text-sm sm:col-span-2">If there is a delivery issue, describe it<textarea name="issueDetails" maxLength={2000} rows={2} defaultValue={group.fulfillment?.issue_details ?? ''} className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3" /></label>
        <button disabled={busy === group.order.id} className="rounded-xl bg-amber-200 px-4 py-3 font-semibold text-neutral-950 disabled:opacity-60 sm:col-span-2">{busy === group.order.id ? 'Saving…' : 'Save fulfillment update'}</button>
      </form>}
    </article>)}{groups.length === 0 && !error && <p className="rounded-2xl border border-white/10 p-8 text-white/60">No orders assigned to this seller yet.</p>}</div>
  </>;
}
