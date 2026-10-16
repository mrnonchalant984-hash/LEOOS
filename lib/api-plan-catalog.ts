/** Developer API tiers; metadata endpoints do not consume usage credits. Provider-cost rates are maintained below. */
export const API_PLAN_CATALOG = [
  { key: 'developer', audience: 'developer', name: 'Free Developer', monthlyNgn: 0, monthlyUsd: 0, includedCredits: 0, rpm: 5, concurrency: 1, maxKeys: 2, maxProjects: 1, features: ['Create and manage API keys', 'Read documentation and SDK examples', 'No billable API execution until a paid plan is active'] },
  { key: 'builder', audience: 'developer', name: 'Builder', monthlyNgn: 9_900, monthlyUsd: 9, includedCredits: 2_000, rpm: 30, concurrency: 3, maxKeys: 5, maxProjects: 3, features: ['API execution and usage dashboard', '2,000 usage credits each month', 'Custom agents with approved read-only tools', 'Standard support'] },
  { key: 'growth', audience: 'developer', name: 'Growth', monthlyNgn: 39_900, monthlyUsd: 35, includedCredits: 10_000, rpm: 120, concurrency: 10, maxKeys: 15, maxProjects: 10, features: ['Higher throughput', '10,000 usage credits each month', 'Custom agents with approved read-only tools', 'Priority support'] },
  { key: 'scale', audience: 'developer', name: 'Scale', monthlyNgn: 149_000, monthlyUsd: 129, includedCredits: 40_000, rpm: 300, concurrency: 25, maxKeys: 50, maxProjects: 30, features: ['Higher concurrency', '40,000 usage credits each month', 'Custom agents with approved read-only tools', 'Priority support and onboarding'] },
  { key: 'business_starter', audience: 'business', name: 'Business Starter', monthlyNgn: 29_900, monthlyUsd: 25, includedCredits: 5_000, rpm: 60, concurrency: 5, maxKeys: 10, maxProjects: 5, features: ['Business API usage', '5,000 usage credits each month', 'Team-ready project limits'] },
  { key: 'business_pro', audience: 'business', name: 'Business Pro', monthlyNgn: 99_000, monthlyUsd: 79, includedCredits: 25_000, rpm: 240, concurrency: 20, maxKeys: 30, maxProjects: 20, features: ['Production business usage', '25,000 usage credits each month', 'Priority support'] },
  { key: 'business_scale', audience: 'business', name: 'Business Scale', monthlyNgn: 299_000, monthlyUsd: 249, includedCredits: 100_000, rpm: 600, concurrency: 50, maxKeys: 100, maxProjects: 100, features: ['High-volume business usage', '100,000 usage credits each month', 'Priority onboarding'] },
] as const;

export const ENTERPRISE_API_PLAN = {
  key: 'enterprise', name: 'Enterprise', pricing: 'custom', includedCredits: null,
  features: ['Negotiated usage and limits', 'Organization-level key and access policies', 'Custom agents with approved read-only tools', 'Support and service levels only when contracted'],
} as const;

export const API_PLAN_CURRENCIES = ['NGN', 'USD'] as const;
export type ApiPlanCurrency = typeof API_PLAN_CURRENCIES[number];
export const API_PLAN_BILLING_PERIOD = 'monthly' as const;
export const API_PLAN_CHECKOUT_ENABLED = true;

export const API_MODEL_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const API_MODEL_PRICING_REVIEWED_ON = '2026-10-16';
export const API_CREDIT_PROVIDER_COST_USD = 0.0006;
export const API_MODEL_PRICING = {
  'gpt-4o-mini': { inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6 },
} as const;

export type ApiModel = keyof typeof API_MODEL_PRICING;

export function isApiModel(model: string): model is ApiModel {
  return Object.hasOwn(API_MODEL_PRICING, model);
}

export function getSupportedApiModels(configured = process.env.LEONARDX_API_MODELS): ApiModel[] {
  const requested = configured === undefined ? ['gpt-4o-mini'] : configured.split(',').map(model => model.trim()).filter(Boolean);
  return [...new Set(requested.filter(isApiModel))];
}

export function getApiProviderCostUsd(model: string, inputTokens: number, outputTokens: number) {
  if (!isApiModel(model)) return null;
  const pricing = API_MODEL_PRICING[model];
  const input = Math.max(0, Math.ceil(inputTokens));
  const output = Math.max(0, Math.ceil(outputTokens));
  return (input * pricing.inputUsdPerMillionTokens + output * pricing.outputUsdPerMillionTokens) / 1_000_000;
}

export function calculateApiCredits(model: string, inputTokens: number, outputTokens: number) {
  const providerCostUsd = getApiProviderCostUsd(model, inputTokens, outputTokens);
  return providerCostUsd === null ? null : Math.max(1, Math.ceil(providerCostUsd / API_CREDIT_PROVIDER_COST_USD));
}

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
