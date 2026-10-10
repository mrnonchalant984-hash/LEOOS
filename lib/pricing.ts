export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type PublicPaidPlanKey = 'standard' | 'pro' | 'business';
export type PlanKey = 'free' | 'standard' | 'pro' | 'unlimited' | 'business';
export type PaidPlanKey = 'standard' | 'pro' | 'unlimited';
export type ProjectType = 'website' | 'web_app' | 'saas' | 'mobile_app' | 'game';
export const PUBLIC_PAID_PLAN_KEYS = ['standard', 'pro', 'business'] as const satisfies readonly PublicPaidPlanKey[];
export const BILLING_PERIODS = ['monthly', 'quarterly', 'yearly'] as const satisfies readonly BillingPeriod[];
export const PLAN_CURRENCY = 'NGN' as const;
export type PlanDefinition = {
  key: PlanKey;
  name: string;
  description: string;
  features: string[];
  projectTypes: ProjectType[];
  limits: { maxProjects: number; monthlyBuilds: number; monthlyImageCredits: number };
};

export const planConfig: Record<PaidPlanKey, PlanDefinition> = {
  standard: {
    key: 'standard', name: 'STANDARD', description: 'Websites, web apps, and SaaS projects with standard build capacity.',
    features: ['chat', 'file-review', 'image-generation', 'code-review', 'website-builder', 'web-app-builder', 'saas-builder'],
    projectTypes: ['website', 'web_app', 'saas'], limits: { maxProjects: 3, monthlyBuilds: 10, monthlyImageCredits: 30 },
  },
  pro: {
    key: 'pro', name: 'PRO', description: 'Advanced web product development with higher project and build capacity.',
    features: ['chat', 'file-review', 'image-generation', 'code-review', 'website-builder', 'web-app-builder', 'saas-builder', 'voice'],
    projectTypes: ['website', 'web_app', 'saas'], limits: { maxProjects: 10, monthlyBuilds: 30, monthlyImageCredits: 100 },
  },
  unlimited: {
    key: 'unlimited', name: 'BUSINESS', description: 'Higher-capacity development for teams and growing businesses.',
    features: ['chat', 'file-review', 'image-generation', 'code-review', 'website-builder', 'web-app-builder', 'saas-builder', 'voice'],
    projectTypes: ['website', 'web_app', 'saas'], limits: { maxProjects: 25, monthlyBuilds: 100, monthlyImageCredits: 500 },
  },
};

export const freePlan: PlanDefinition = {
  key: 'free', name: 'FREE', description: 'One free website project and one build/deployment each month. Eligible deployments include a 90-day hosting trial; hosting renewal is separate.',
  features: ['chat', 'image-generation', 'website-builder'], projectTypes: ['website'],
  limits: { maxProjects: 1, monthlyBuilds: 1, monthlyImageCredits: 1 },
};

export function getPlan(key: string): PlanDefinition {
  const normalized = key.toLowerCase();
  if (normalized === 'free') return freePlan;
  if (normalized === 'business') return planConfig.unlimited;
  return normalized in planConfig ? planConfig[normalized as PaidPlanKey] : freePlan;
}

/** Prices are integer NGN amounts; the persisted `unlimited` plan ID is retained as Business. */
export const planPricingNgn: Record<PublicPaidPlanKey, number> = {
  standard: 12_500,
  pro: 31_500,
  business: 63_000,
};

export const billingIntervalMonths: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export const publicPlanToInternal: Record<PublicPaidPlanKey, PaidPlanKey> = {
  standard: 'standard',
  pro: 'pro',
  business: 'unlimited',
};

export function resolvePaidPlan(input: string): PaidPlanKey | null {
  if (input === 'business') return 'unlimited';
  return input === 'standard' || input === 'pro' || input === 'unlimited' ? input : null;
}

export function getPublicPlanKey(plan: PaidPlanKey): PublicPaidPlanKey {
  return plan === 'unlimited' ? 'business' : plan;
}

export function getPlanDisplayName(key: string): string {
  return getPlan(key).name;
}

export function getPlanPriceNgn(plan: PaidPlanKey | PublicPaidPlanKey, period: BillingPeriod): number {
  const internalPlan = resolvePaidPlan(plan);
  if (!internalPlan) throw new Error('Unsupported paid plan.');
  return planPricingNgn[getPublicPlanKey(internalPlan)] * billingIntervalMonths[period];
}

/** Paystack accepts NGN amounts in kobo. Keep this conversion integer-only. */
export function getPlanPrice(plan: PaidPlanKey | PublicPaidPlanKey, period: BillingPeriod): number {
  return getPlanPriceNgn(plan, period) * 100;
}

export function formatNairaKobo(amountKobo: number): string {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 0) return 'Price unavailable';
  const naira = Math.floor(amountKobo / 100);
  const kobo = amountKobo % 100;
  const whole = naira.toLocaleString('en-NG');
  return `₦${whole}${kobo ? `.${String(kobo).padStart(2, '0')}` : ''}`;
}

export const oneTimeServices = {
  'ai-mockup': { name:'AI Mockup', priceKobo: 5_000_000, featureKey:'image-generation' },
  'code-review': { name:'Code Review', priceKobo: 2_000_000, featureKey:'code-review' },
} as const;
