import { Activity, CreditCard, Database, Globe2, KeyRound, Sparkles } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';
import { ServiceLiveness } from '@/components/ServiceLiveness';

export const dynamic = 'force-dynamic';

const configured = (value?: string) => Boolean(value?.trim());

export default function Status() {
  const services = [
    ['Supabase', configured(process.env.NEXT_PUBLIC_SUPABASE_URL), Database],
    ['OpenAI', configured(process.env.OPENAI_API_KEY), Sparkles],
    ['Vercel API', configured(process.env.VERCEL_TOKEN), Activity],
    ['Paystack', configured(process.env.PAYSTACK_SECRET_KEY), CreditCard],
    ['Sentry', configured(process.env.SENTRY_DSN) && configured(process.env.NEXT_PUBLIC_SENTRY_DSN), KeyRound],
  ] as const;

  return <LEOAppShell title="System Status" subtitle="Configuration visibility and an explicit application liveness check.">
    <div className="page-hero">
      <span className="mini-label">Operational transparency</span>
      <h2>Separate process availability from provider status.</h2>
      <p>Configuration presence is not an uptime guarantee. The liveness check below tests only this application process; provider availability and Sentry alert delivery still need external monitoring.</p>
    </div>
    <ServiceLiveness/>
    <div className="mt-3 data-list">{services.map(([name, isConfigured, Icon]) => <Panel key={name}>
      <div className="flex items-center gap-3"><div className="data-icon"><Icon size={16}/></div><div className="flex-1"><strong className="text-sm">{name}</strong><p className="text-[10px] text-zinc-500">{isConfigured ? 'Configuration detected; provider health is not checked here.' : 'Configuration not detected in this server environment.'}</p></div><StatusPill status={isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}/></div>
    </Panel>)}</div>
    <Panel className="mt-3">
      <div className="flex items-center gap-3"><div className="data-icon"><Globe2 size={16}/></div><div><strong className="text-sm">Vercel Speed Insights</strong><p className="mt-1 text-xs leading-5 text-zinc-500">The measurement component is installed at 25% sampling. Enable Speed Insights in the Vercel project and deploy before expecting real-user LCP, INP, and CLS data.</p></div></div>
    </Panel>
  </LEOAppShell>;
}
