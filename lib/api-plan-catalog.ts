/** Public API plans. Prices and credit conversion must be validated against live provider costs before production launch. */
export const API_PLAN_CATALOG = [
  { key: 'developer', audience: 'developer', name: 'Free Developer', monthlyNgn: 0, monthlyUsd: 0, includedCredits: 0, rpm: 5, concurrency: 1, maxKeys: 2, maxProjects: 1, features: ['Create and manage API keys', 'Read documentation and SDK examples', 'No billable API execution until a paid plan is active'] },
  { key: 'builder', audience: 'developer', name: 'Builder', monthlyNgn: 9_900, monthlyUsd: 9, includedCredits: 2_000, rpm: 30, concurrency: 3, maxKeys: 5, maxProjects: 3, features: ['API execution and usage dashboard', '2,000 usage credits each month', 'Standard support'] },
  { key: 'growth', audience: 'developer', name: 'Growth', monthlyNgn: 39_900, monthlyUsd: 35, includedCredits: 10_000, rpm: 120, concurrency: 10, maxKeys: 15, maxProjects: 10, features: ['Higher throughput', '10,000 usage credits each month', 'Priority support'] },
  { key: 'scale', audience: 'developer', name: 'Scale', monthlyNgn: 149_000, monthlyUsd: 129, includedCredits: 40_000, rpm: 300, concurrency: 25, maxKeys: 50, maxProjects: 30, features: ['Higher concurrency', '40,000 usage credits each month', 'Priority support and onboarding'] },
  { key: 'business_starter', audience: 'business', name: 'Business Starter', monthlyNgn: 29_900, monthlyUsd: 25, includedCredits: 5_000, rpm: 60, concurrency: 5, maxKeys: 10, maxProjects: 5, features: ['Business API usage', '5,000 usage credits each month', 'Team-ready project limits'] },
  { key: 'business_pro', audience: 'business', name: 'Business Pro', monthlyNgn: 99_000, monthlyUsd: 79, includedCredits: 25_000, rpm: 240, concurrency: 20, maxKeys: 30, maxProjects: 20, features: ['Production business usage', '25,000 usage credits each month', 'Priority support'] },
  { key: 'business_scale', audience: 'business', name: 'Business Scale', monthlyNgn: 299_000, monthlyUsd: 249, includedCredits: 100_000, rpm: 600, concurrency: 50, maxKeys: 100, maxProjects: 100, features: ['High-volume business usage', '100,000 usage credits each month', 'Priority onboarding'] },
] as const;

export const ENTERPRISE_API_PLAN = {
  key: 'enterprise', name: 'Enterprise', pricing: 'custom', includedCredits: null,
  features: ['Negotiated usage and limits', 'Organization-level key and access policies', 'Support and service levels only when contracted'],
} as const;

export const API_PLAN_CURRENCIES = ['NGN', 'USD'] as const;
export type ApiPlanCurrency = typeof API_PLAN_CURRENCIES[number];
export const API_PLAN_BILLING_PERIOD = 'monthly' as const;
// Model inference is metered from measured provider token usage. Metadata endpoints do not consume usage credits.
export const API_CREDITS_PER_1000_TOKENS = 1;
export const API_PLAN_CHECKOUT_ENABLED = true;

export function getApiPlan(key: string) {
  if (key === 'enterprise') return ENTERPRISE_API_PLAN;
  return API_PLAN_CATALOG.find((plan) => plan.key === key) ?? null;
}

export function getApiPlanPriceMinor(key: string, currency: ApiPlanCurrency): number | null {
  const plan = API_PLAN_CATALOG.find((item) => item.key === key);
  if (!plan || plan.key === 'developer') return null;
  const major = currency === 'NGN' ? plan.monthlyNgn : plan.monthlyUsd;
  return Math.round(major * 100);
}
