'use client';

import { useEffect, useState } from 'react';
import { getPlanDisplayName } from '@/lib/pricing';

type AccountData = {
  authenticated?: boolean;
  user?: { email?: string | null };
  subscription?: { plan?: string; billing_period?: string } | null;
};

export function AccountBar() {
  const [data, setData] = useState<AccountData | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((value: AccountData) => { if (active) setData(value); })
      .catch(() => { if (active) setData({ authenticated: false }); });
    return () => { active = false; };
  }, []);

  if (!data) return null;

  return <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
    {data.authenticated ? <div className="flex flex-wrap items-center justify-between gap-3">
      <span>Signed in as <b>{data.user?.email || 'your account'}</b></span>
      <span className="text-yellow-300">{data.subscription
        ? `${getPlanDisplayName(data.subscription.plan || 'free')} · ${data.subscription.billing_period || 'active'}`
        : 'Free account'}</span>
    </div> : <span>Free mode — <a className="text-yellow-300" href="/auth">Create an account</a> to unlock protected features.</span>}
  </div>;
}
