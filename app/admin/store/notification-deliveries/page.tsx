'use client';

import { useCallback, useEffect, useState } from 'react';

type Delivery = { id: string; user_id: string; channel: string; delivery_key: string; status: string; attempt_count: number; error_code: string | null; delivered_at: string | null; updated_at: string; notification: { title: string; kind: string } | null };
type Result = { deliveries: Delivery[]; counts: Record<string,number> };

export default function BravertonNotificationDeliveryAdminPage() {
  const [data,setData] = useState<Result>({deliveries:[],counts:{}});
  const [error,setError] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/store/notification-deliveries',{cache:'no-store'});
    const result = await response.json().catch(()=>({}));
    if(!response.ok){setError(result.error ?? 'Delivery log is unavailable.');return;}
    setData(result);setError('');
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(timer);},[load]);
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 text-white sm:px-8">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-200">Braverton Market · Owner operations</p>
    <h1 className="mt-3 text-3xl font-semibold">Notification delivery evidence</h1>
    <p className="mt-2 text-sm text-white/55">Provider acceptance is recorded as sent; failed and skipped deliveries are retained with retry counts and error codes.</p>
    <button onClick={()=>void load()} className="mt-5 rounded-lg border border-white/15 px-3 py-2 text-sm">Refresh</button>
    {error&&<p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>}
    <section className="mt-6 grid gap-3 sm:grid-cols-4">{['sent','failed','skipped','pending'].map(status=><article key={status} className="rounded-xl border border-white/10 p-4"><p className="text-xs uppercase text-white/45">{status}</p><p className="mt-2 text-2xl font-semibold">{data.counts[status] ?? 0}</p></article>)}</section>
    <section className="mt-7 space-y-3">{data.deliveries.map(item=><article key={item.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.notification?.title ?? item.delivery_key}</p><span className="text-xs capitalize text-white/55">{item.channel} · {item.status}</span></div><p className="mt-1 text-xs text-white/45">{item.notification?.kind ?? 'notification'} · recipient {item.user_id.slice(0,8)} · attempts {item.attempt_count}</p>{item.error_code&&<p className="mt-2 text-xs text-rose-200">Error: {item.error_code}</p>}<p className="mt-2 text-xs text-white/40">{item.delivered_at ? `Accepted at ${new Date(item.delivered_at).toLocaleString()}` : `Last update ${new Date(item.updated_at).toLocaleString()}`}</p></article>)}</section>
    {!data.deliveries.length&&!error&&<p className="mt-6 rounded-xl border border-white/10 p-6 text-sm text-white/50">No notification delivery attempts recorded yet.</p>}
  </main>;
}
