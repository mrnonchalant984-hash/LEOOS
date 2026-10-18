'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { BUDGET_OPTIONS, type BudgetTier } from '@/lib/capability-alternatives';
import type { ProjectStrategy } from '@/lib/project-discovery';

const field = 'mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-white/40';

export function DiscoveryWizard({
  onApproved,
}: {
  onApproved?: (payload: { answers: Record<string, unknown>; strategy: ProjectStrategy }) => void;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'discovery' | 'autonomous'>('discovery');
  const [productSummary, setProductSummary] = useState('');
  const [productKind, setProductKind] = useState('website');
  const [audience, setAudience] = useState('');
  const [problem, setProblem] = useState('');
  const [essentialFeatures, setEssentialFeatures] = useState('');
  const [laterFeatures, setLaterFeatures] = useState('');
  const [visualDirection, setVisualDirection] = useState('minimal');
  const [budgetTier, setBudgetTier] = useState<BudgetTier>('free');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [needsPayments, setNeedsPayments] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(true);
  const [hasExistingRepo, setHasExistingRepo] = useState(true);
  const [isUpgrade, setIsUpgrade] = useState(true);
  const [strategy, setStrategy] = useState<ProjectStrategy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const answers = useMemo(() => ({
    productSummary,
    productKind,
    audience,
    problem,
    essentialFeatures: essentialFeatures.split(',').map((item) => item.trim()).filter(Boolean),
    laterFeatures: laterFeatures.split(',').map((item) => item.trim()).filter(Boolean),
    hasExistingRepo,
    isUpgrade,
    visualDirection,
    devices: ['desktop', 'mobile'],
    mobileFirst: true,
    wantUiConcepts: false,
    wantLivePreview: true,
    needsDatabase: true,
    needsAuth,
    needsPayments,
    needsEmail,
    budgetTier,
    budgetAmount: budgetAmount ? Number(budgetAmount) : null,
    budgetCurrency: budgetCurrency || null,
    ownedResources: {
      domain: false,
      hosting: false,
      database: true,
      aiApi: false,
      emailProvider: false,
      paymentProvider: false,
      gitRepo: hasExistingRepo,
      deploymentAccess: false,
    },
    mode,
  }), [
    productSummary, productKind, audience, problem, essentialFeatures, laterFeatures,
    hasExistingRepo, isUpgrade, visualDirection, needsAuth, needsPayments, needsEmail,
    budgetTier, budgetAmount, budgetCurrency, mode,
  ]);

  async function generateStrategy() {
    setLoading(true);
    setError('');
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const access = (await supabase.auth.getSession()).data.session?.access_token;
      if (!access) throw new Error('Sign in to generate a project strategy.');
      const response = await fetch('/api/engineering/discovery/strategy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Strategy could not be generated.');
      setStrategy(result.strategy);
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Strategy could not be generated.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--gold-bright)]">Project discovery</p>
      <h2 className="mt-2 text-2xl font-bold text-white">Describe what you need</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Only material questions are asked. Repository facts are inspected separately and are not re-asked.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {['Intent', 'Visual & budget', 'Technical', 'Strategy'].map((label, index) => (
          <span
            key={label}
            className={`rounded-full border px-3 py-1 text-xs ${
              step === index ? 'border-[var(--gold)]/40 bg-[var(--gold)]/10 text-white' : 'border-white/10 text-zinc-500'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <div className="mt-6 grid gap-4">
          <label className="text-sm text-zinc-300">
            Mode
            <select className={field} value={mode} onChange={(event) => setMode(event.target.value as 'discovery' | 'autonomous')}>
              <option value="discovery">Discovery mode</option>
              <option value="autonomous">Autonomous mode</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            What are you building?
            <textarea className={field} rows={4} value={productSummary} onChange={(event) => setProductSummary(event.target.value)} required />
          </label>
          <label className="text-sm text-zinc-300">
            Product kind
            <select className={field} value={productKind} onChange={(event) => setProductKind(event.target.value)}>
              {['website', 'saas', 'marketplace', 'dashboard', 'mobile_app', 'game', 'api', 'internal_tool', 'other'].map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            Who will use it?
            <input className={field} value={audience} onChange={(event) => setAudience(event.target.value)} />
          </label>
          <label className="text-sm text-zinc-300">
            What problem should it solve?
            <textarea className={field} rows={3} value={problem} onChange={(event) => setProblem(event.target.value)} />
          </label>
          <label className="text-sm text-zinc-300">
            Essential features (comma-separated)
            <input className={field} value={essentialFeatures} onChange={(event) => setEssentialFeatures(event.target.value)} />
          </label>
          <label className="text-sm text-zinc-300">
            Later features (comma-separated)
            <input className={field} value={laterFeatures} onChange={(event) => setLaterFeatures(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={hasExistingRepo} onChange={(event) => setHasExistingRepo(event.target.checked)} /> Existing repository</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={isUpgrade} onChange={(event) => setIsUpgrade(event.target.checked)} /> Upgrade existing app</label>
          </div>
          <button type="button" onClick={() => setStep(1)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">Continue</button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="mt-6 grid gap-4">
          <label className="text-sm text-zinc-300">
            Visual direction
            <select className={field} value={visualDirection} onChange={(event) => setVisualDirection(event.target.value)}>
              {['minimal', 'premium', 'corporate', 'playful', 'futuristic', 'editorial', 'other'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm text-zinc-300">Development budget</legend>
            {BUDGET_OPTIONS.map((option) => (
              <label key={option.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm">
                <input
                  type="radio"
                  name="budget"
                  checked={budgetTier === option.id}
                  onChange={() => setBudgetTier(option.id)}
                />
                <span>
                  <strong className="text-white">{option.label}</strong>
                  <span className="mt-1 block text-xs text-zinc-500">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {budgetTier === 'custom' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-zinc-300">Amount<input className={field} value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} /></label>
              <label className="text-sm text-zinc-300">Currency<input className={field} value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value)} /></label>
            </div>
          ) : null}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white">Back</button>
            <button type="button" onClick={() => setStep(2)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">Continue</button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={needsAuth} onChange={(event) => setNeedsAuth(event.target.checked)} /> Authentication</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={needsPayments} onChange={(event) => setNeedsPayments(event.target.checked)} /> Payments</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={needsEmail} onChange={(event) => setNeedsEmail(event.target.checked)} /> Email / contact delivery</label>
          </div>
          <p className="text-xs text-zinc-500">
            Paid APIs, hosting, and subscriptions are never purchased without your explicit authorization. Potential recurring costs are listed in the strategy.
          </p>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white">Back</button>
            <button type="button" disabled={loading} onClick={() => void generateStrategy()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
              {loading ? 'Generating…' : 'Generate strategy'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && strategy ? (
        <div className="mt-6 grid gap-4">
          <article className="rounded-xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-sm font-semibold text-white">Product objectives</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">{strategy.productObjectives.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-sm font-semibold text-white">Architecture</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">{strategy.architecture.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-sm font-semibold text-white">Alternatives</h3>
            <ul className="mt-2 space-y-2 text-sm text-zinc-300">
              {strategy.freeAndPaidAlternatives.map((item) => (
                <li key={item.capability}><strong className="text-white">{item.capability}:</strong> {item.recommendation}</li>
              ))}
            </ul>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-sm font-semibold text-white">Risks</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {(strategy.outstandingRisks.length ? strategy.outstandingRisks : ['No outstanding risks identified from current answers.']).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white">Edit answers</button>
            <button
              type="button"
              onClick={() => onApproved?.({ answers, strategy })}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
            >
              Approve strategy
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
