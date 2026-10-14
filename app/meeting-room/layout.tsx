'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { authFetch } from '@/lib/client-auth';

type AccessState = 'checking' | 'allowed' | 'signed-out' | 'forbidden' | 'unavailable';

export default function MeetingRoomAdminLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>('checking');
  const [detail, setDetail] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    authFetch('/api/meetings', { cache: 'no-store' }).then(async response => {
      if (!alive) return;
      if (response.status === 401) { setState('signed-out'); return; }
      if (response.status === 403) {
        const body = await response.json().catch(() => ({}));
        setDetail(body.error || 'This account or device is not authorized for the private owner workspace.');
        setState('forbidden');
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setDetail(body.error || `The dashboard returned HTTP ${response.status}.`);
        setState('unavailable');
        return;
      }
      setState('allowed');
    }).catch(() => { if (alive) { setDetail('Could not contact the dashboard API. Check the app server and environment configuration.'); setState('unavailable'); } });
    return () => { alive = false; };
  }, [retry]);

  if (state === 'allowed') return children;
  if (state === 'checking') return <main className="min-h-screen bg-[#08090d] p-8 text-sm text-zinc-400" aria-live="polite">Verifying private owner workspace access…</main>;
  const title = state === 'signed-out' ? 'Sign in required' : state === 'forbidden' ? 'Owner access not verified' : 'Dashboard temporarily unavailable';
  const description = state === 'signed-out' ? 'Sign in to your LeonardX account, then return to this page.' : state === 'forbidden' ? 'This page is intentionally separate from customer-facing Agents. The app will not redirect you to /agents when owner access fails.' : 'The page has its own dashboard, but its data service did not respond successfully.';
  return <main className="min-h-screen bg-[#08090d] px-4 py-16 text-zinc-100"><section className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[.03] p-6"><p className="text-xs font-bold uppercase tracking-widest text-amber-300">Private owner workspace</p><h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>{detail && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">{detail}</p>}<div className="mt-5 flex flex-wrap gap-3">{state === 'signed-out' ? <Link className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black" href="/auth?next=%2Fmeeting-room">Sign in</Link> : <button className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black" onClick={() => { setState('checking'); setDetail(''); setRetry(value => value + 1); }}>Retry access check</button>}<Link className="rounded-xl border border-white/10 px-4 py-2" href="/admin">Admin control center</Link></div></section></main>;
}
