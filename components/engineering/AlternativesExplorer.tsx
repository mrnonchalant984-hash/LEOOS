'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { BudgetTier, CapabilityOption, CapabilityRequirement } from '@/lib/capability-alternatives';

type RequirementView = CapabilityRequirement & {
  recommendation: CapabilityOption | null;
  recommendationReason: string;
  unavailablePaid: CapabilityOption[];
};

export function AlternativesExplorer({ initialBudget = 'free' as BudgetTier }) {
  const [budget, setBudget] = useState<BudgetTier>(initialBudget);
  const [requirements, setRequirements] = useState<RequirementView[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const access = (await supabase.auth.getSession()).data.session?.access_token;
        if (!access) throw new Error('Sign in to explore alternatives.');
        const response = await fetch(`/api/engineering/alternatives?budget=${encodeURIComponent(budget)}`, {
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Alternatives could not be loaded.');
        if (alive) setRequirements(result.requirements || []);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Alternatives could not be loaded.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [budget]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Alternatives explorer</p>
          <h3 className="mt-2 text-lg font-bold text-white">Budget-aware capability options</h3>
        </div>
        <label className="text-xs text-zinc-400">
          Budget
          <select
            className="ml-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            value={budget}
            onChange={(event) => setBudget(event.target.value as BudgetTier)}
          >
            <option value="free">Free</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="professional">Professional</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>
      {loading ? <p className="mt-4 text-sm text-zinc-500">Loading alternatives…</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      <div className="mt-5 grid gap-4">
        {requirements.map((requirement) => (
          <article key={requirement.capability} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">{requirement.label}</h4>
            <p className="mt-1 text-xs text-zinc-500">{requirement.description}</p>
            {requirement.recommendation ? (
              <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[.06] px-3 py-2 text-sm text-emerald-100">
                Recommended: {requirement.recommendation.title}. {requirement.recommendationReason}
              </p>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                {requirement.recommendationReason}
              </p>
            )}
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {requirement.options.map((option) => (
                <li key={option.id} className="rounded-lg border border-white/10 p-3">
                  <p className="text-sm font-medium text-white">{option.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{option.costLabel}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">
                    {option.alreadyImplemented ? 'Already implemented' : 'Not yet configured'}
                    {option.requiresPaidService ? ' · paid service' : ' · free/local path'}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-400">
                    {option.limitations.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
