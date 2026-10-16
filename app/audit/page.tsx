'use client';

import { useState, type FormEvent } from 'react';
import { Activity, Gauge, LoaderCircle, ShieldCheck } from 'lucide-react';

type AuditMetric = { id: string; label: string; value: string; score: number | null };
type Recommendation = { id: string; title: string; description: string; savings: string };
type StrategyAudit = {
  strategy: 'mobile' | 'desktop';
  lighthouseVersion: string | null;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  metrics: AuditMetric[];
  recommendations: Recommendation[];
};
type AuditResult = {
  error?: string;
  url?: string;
  status?: number;
  title?: string;
  metrics?: { scripts: number; images: number; forms: number; insecureReferences: number };
  security?: { https: boolean; riskyPatterns: number; findings: string[] };
  lighthouse?: { provider: string; mobile: StrategyAudit; desktop: StrategyAudit };
  note?: string;
};

const categories = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['bestPractices', 'Best practices'],
  ['seo', 'SEO'],
] as const;

function scoreTone(score: number | null) {
  if (score === null) return 'border-white/10 bg-white/[.03] text-zinc-400';
  if (score >= 90) return 'border-emerald-300/20 bg-emerald-300/[.06] text-emerald-200';
  if (score >= 50) return 'border-amber-300/20 bg-amber-300/[.06] text-amber-100';
  return 'border-red-300/20 bg-red-300/[.06] text-red-200';
}

function StrategyCard({ result }: { result: StrategyAudit }) {
  const name = result.strategy === 'mobile' ? 'Mobile' : 'Desktop';
  return <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">Lighthouse results</p><h2 className="mt-1 text-xl font-semibold">{name}</h2></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">{result.lighthouseVersion ? `Lighthouse ${result.lighthouseVersion}` : 'Google Lighthouse'}</span>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {categories.map(([key, label]) => {
        const value = result.scores[key];
        return <div key={key} className={`rounded-xl border p-3 ${scoreTone(value)}`}>
          <p className="text-xs">{label}</p>
          <p className="mt-2 text-3xl font-bold">{value === null ? '—' : value}</p>
          <p className="mt-1 text-[11px]">{value === null ? 'Not reported' : value >= 90 ? 'Good' : value >= 50 ? 'Needs improvement' : 'Poor'}</p>
        </div>;
      })}
    </div>
    <div className="mt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Gauge size={15}/> Core performance signals</h3>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {result.metrics.map(metric => <div key={metric.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.07] bg-white/[.02] px-3 py-2">
          <dt className="text-xs text-zinc-400">{metric.label}</dt><dd className="text-sm font-medium text-zinc-100">{metric.value}</dd>
        </div>)}
      </dl>
    </div>
    <div className="mt-5">
      <h3 className="text-sm font-semibold">Recommended improvements</h3>
      {result.recommendations.length ? <ul className="mt-2 space-y-2">
        {result.recommendations.map(item => <li key={item.id} className="rounded-lg border border-white/[.07] bg-white/[.02] p-3">
          <p className="text-sm font-medium text-zinc-100">{item.title}{item.savings && <span className="ml-2 text-xs text-amber-200">{item.savings}</span>}</p>
          {item.description && <p className="mt-1 text-xs leading-5 text-zinc-400">{item.description}</p>}
        </li>)}
      </ul> : <p className="mt-2 rounded-lg border border-emerald-300/10 bg-emerald-300/[.03] p-3 text-sm text-zinc-400">No performance opportunities were returned for this run.</p>}
    </div>
  </section>;
}

export default function AuditPage() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function audit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({ error: 'The audit service returned an invalid response.' }));
      setResult(response.ok ? data as AuditResult : { error: data.error || 'Website audit failed.' });
    } catch {
      setResult({ error: 'The audit service is unavailable. Check your connection and retry.' });
    } finally {
      setLoading(false);
    }
  }

  return <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
    <div className="max-w-3xl">
      <p className="flex items-center gap-2 text-sm font-bold text-yellow-300"><Activity size={16}/> LEONARDX WEBSITE AUDIT</p>
      <h1 className="mt-3 text-4xl font-black sm:text-6xl">A clearer picture of your website.</h1>
      <p className="mt-4 text-zinc-400">Run Google Lighthouse through PageSpeed Insights for mobile and desktop performance, accessibility, best practices, and SEO. LeonardX also reports a small set of response-header checks.</p>
    </div>

    <form onSubmit={audit} className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:flex-row sm:p-5">
      <label className="sr-only" htmlFor="audit-url">Website URL</label>
      <input
        id="audit-url"
        value={url}
        onChange={event => setUrl(event.target.value)}
        placeholder="https://example.com"
        required
        type="url"
        className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
      />
      <button disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black disabled:cursor-wait disabled:opacity-60">
        {loading ? <LoaderCircle size={16} className="animate-spin"/> : <Gauge size={16}/>}
        {loading ? 'Running mobile and desktop audits…' : 'Run Lighthouse audit'}
      </button>
    </form>

    {loading && <p role="status" aria-live="polite" className="mt-4 text-sm text-zinc-400">Google is loading and measuring both versions of the public page. This may take up to a minute.</p>}
    {result?.error && <p role="alert" className="mt-6 rounded-xl border border-red-300/20 bg-red-300/[.05] p-4 text-sm text-red-100">{result.error}</p>}

    {result?.lighthouse && <div className="mt-8 space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">Audited URL</p>
        <a href={result.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm text-yellow-200 underline">{result.url}</a>
        <p className="mt-2 text-xs text-zinc-500">{result.title || 'Page title not detected'} · HTTP {result.status}</p>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <StrategyCard result={result.lighthouse.mobile}/>
        <StrategyCard result={result.lighthouse.desktop}/>
      </div>
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={17}/> Response and page signals</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['HTTPS', result.security?.https ? 'Enabled' : 'Not detected'],
            ['Scripts', result.metrics?.scripts ?? 0],
            ['Images', result.metrics?.images ?? 0],
            ['Forms', result.metrics?.forms ?? 0],
            ['Insecure references', result.metrics?.insecureReferences ?? 0],
            ['Risky code patterns', result.security?.riskyPatterns ?? 0],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-white/[.07] bg-white/[.02] p-3">
            <dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd>
          </div>)}
        </dl>
        {!!result.security?.findings.length && <ul className="mt-4 space-y-1 text-sm text-amber-100">{result.security.findings.map(finding => <li key={finding}>• {finding}</li>)}</ul>}
        <p className="mt-4 text-xs leading-5 text-zinc-500">{result.note}</p>
      </section>
    </div>}
  </main>;
}
