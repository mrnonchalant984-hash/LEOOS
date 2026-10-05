export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type PlanKey = 'standard' | 'pro' | 'unlimited';

export const planConfig: Record<PlanKey, { name:string; description:string; features:string[] }> = {
  standard: { name:'STANDARD', description:'Core Leo tools for getting started.', features:['chat','file-review'] },
  pro: { name:'PRO', description:'More creative and development features.', features:['chat','file-review','image-generation','code-review','website-builder'] },
  unlimited: { name:'UNLIMITED', description:'All currently configured Leo features.', features:['chat','file-review','image-generation','code-review','website-builder','voice'] },
};

const freePlan = { name:'FREE', description:'Core Leo tools for getting started.', features:['chat'] };

export function getPlan(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === 'free') return freePlan;
  return normalized in planConfig ? planConfig[normalized as PlanKey] : freePlan;
}

const envPrice = (key:string) => {
  const raw = process.env[key];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function getPlanPrice(plan: PlanKey, period: BillingPeriod) {
  return envPrice(`NEXT_PUBLIC_${plan.toUpperCase()}_${period.toUpperCase()}_KOBO`);
}

export const oneTimeServices = {
  'ai-mockup': { name:'AI Mockup', priceKobo: 5_000_000, featureKey:'image-generation' },
  'full-website': { name:'Full Website', priceKobo: 35_000_000, featureKey:'website-builder' },
  'code-review': { name:'Code Review', priceKobo: 2_000_000, featureKey:'code-review' },
} as const;
