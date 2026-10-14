'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CreditCard, LoaderCircle } from 'lucide-react';
import { API_PLAN_CATALOG, type ApiPlanCurrency } from '@/lib/api-plan-catalog';

type BillingStatus = { active: boolean; subscription: null | { plan_key: string; currency: string; current_period_end: string; credits_remaining: number; included_credits: number }; renewalMode?: string };
const money = (amount: number, currency: ApiPlanCurrency) => new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency, maximumFractionDigits: currency === 'NGN' ? 0 : 2 }).format(amount);

export function ApiPlanChooser() {
  const [currency, setCurrency] = useState<ApiPlanCurrency>('NGN');
  const [audience, setAudience] = useState<'developer' | 'business'>('developer');
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loadingPlan, setLoadingPlan] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/developers/billing/status', { cache: 'no-store' }).then(async (r) => {
      const data = await r.json().catch(() => null);
      if (live && r.ok) setBilling(data);
    }).catch(() => undefined);
    const noticeTimer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('payment') === 'verified') setNotice('Payment verified. Your API plan is active and your included credits are ready.');
      else if (params.get('payment') === 'pending') setNotice('Payment confirmation is pending. API access activates only after the payment is verified.');
    }, 0);
    return () => { live = false; window.clearTimeout(noticeTimer); };
  }, []);

  async function choosePlan(planKey: string) {
    setLoadingPlan(planKey); setError(''); setNotice('');
    try {
      const response = await fetch('/api/developers/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_key: planKey, currency }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorization_url) { setError(data.error || 'Checkout could not be started.'); return; }
      window.location.assign(data.authorization_url);
    } catch { setError('Network error. Please try again.'); }
    finally { setLoadingPlan(''); }
  }

  const plans = API_PLAN_CATALOG.filter((plan) => plan.audience === audience && plan.key !== 'developer');
  return <div className="mt-5 space-y-5">
    {billing?.active && billing.subscription && <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold text-emerald-100"><CheckCircle2 size={16}/> API plan active</div>
      <p className="mt-1 text-zinc-300">{billing.subscription.plan_key.replaceAll('_', ' ')} · {billing.subscription.credits_remaining.toLocaleString()} of {billing.subscription.included_credits.toLocaleString()} included credits remaining.</p>
      <p className="mt-1 text-xs text-zinc-500">Current period ends {new Date(billing.subscription.current_period_end).toLocaleDateString()}.</p>
    </div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2"><button className={`secondary-button ${audience === 'developer' ? 'border-amber-200/50 text-amber-100' : ''}`} onClick={() => setAudience('developer')}>Developers</button><button className={`secondary-button ${audience === 'business' ? 'border-amber-200/50 text-amber-100' : ''}`} onClick={() => setAudience('business')}>Businesses</button></div>
      <div className="flex items-center gap-2 text-xs text-zinc-400"><span>Billing currency</span><select aria-label="Billing currency" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white" value={currency} onChange={(e) => setCurrency(e.target.value as ApiPlanCurrency)}><option value="NGN">NGN ₦</option><option value="USD">USD $</option></select></div>
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      {plans.map((plan) => {
        const price = currency === 'NGN' ? plan.monthlyNgn : plan.monthlyUsd;
        return <article key={plan.key} className="flex flex-col rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[.18em] text-zinc-500">{audience === 'developer' ? 'Developer API' : 'Business API'}</div>
          <h3 className="mt-2 text-xl font-bold">{plan.name}</h3>
          <div className="mt-4 text-3xl font-black">{money(price, currency)}<span className="ml-1 text-xs font-normal text-zinc-500">/ month</span></div>
          <div className="mt-4 rounded-xl bg-white/[.04] p-3"><strong>{plan.includedCredits.toLocaleString()} credits</strong><p className="mt-1 text-xs text-zinc-500">Included each billing period</p></div>
          <ul className="my-4 flex-1 space-y-2">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-zinc-300"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-200"/>{feature}</li>)}<li className="text-xs text-zinc-500">{plan.rpm} requests/min · {plan.concurrency} concurrent</li><li className="text-xs text-zinc-500">Up to {plan.maxKeys} API keys · {plan.maxProjects} projects</li></ul>
          <button disabled={Boolean(loadingPlan)} onClick={() => void choosePlan(plan.key)} className="primary-button w-full justify-center disabled:opacity-50">{loadingPlan === plan.key ? <LoaderCircle size={14} className="animate-spin"/> : <CreditCard size={14}/>} Choose plan <ArrowRight size={13}/></button>
        </article>;
      })}
    </div>
    <p className="text-xs leading-5 text-zinc-500">API keys can be created for free, but billable API requests require an active paid plan and available credits. If credits run out, requests pause until you renew or add credits. Prices and quotas must be validated against provider costs before being treated as final.</p>
  </div>;
}
