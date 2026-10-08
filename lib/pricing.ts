export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type PlanKey = 'free' | 'standard' | 'pro' | 'unlimited';
export type PaidPlanKey = Exclude<PlanKey, 'free'>;
export type ProjectType = 'website' | 'web_app' | 'saas' | 'mobile_app' | 'game';
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
    key: 'unlimited', name: 'UNLIMITED', description: 'The highest supported development capacity with fair-use limits.',
    features: ['chat', 'file-review', 'image-generation', 'code-review', 'website-builder', 'web-app-builder', 'saas-builder', 'voice'],
    projectTypes: ['website', 'web_app', 'saas'], limits: { maxProjects: 25, monthlyBuilds: 100, monthlyImageCredits: 500 },
  },
};

export const freePlan: PlanDefinition = {
  key: 'free', name: 'FREE', description: 'Leo chat and one limited website project.',
  features: ['chat', 'image-generation', 'website-builder'], projectTypes: ['website'],
  limits: { maxProjects: 1, monthlyBuilds: 1, monthlyImageCredits: 1 },
};

export function getPlan(key: string): PlanDefinition {
  const normalized = key.toLowerCase();
  if (normalized === 'free') return freePlan;
  return normalized in planConfig ? planConfig[normalized as PaidPlanKey] : freePlan;
}

const envPrice = (key:string) => {
  const raw = process.env[key];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function getPlanPrice(plan: PaidPlanKey, period: BillingPeriod) {
  return envPrice(`NEXT_PUBLIC_${plan.toUpperCase()}_${period.toUpperCase()}_KOBO`);
}

export const oneTimeServices = {
  'ai-mockup': { name:'AI Mockup', priceKobo: 5_000_000, featureKey:'image-generation' },
  'code-review': { name:'Code Review', priceKobo: 2_000_000, featureKey:'code-review' },
} as const;
