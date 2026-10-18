import { adminSupabase } from '@/lib/auth';
import { getPlan, type PlanKey } from '@/lib/pricing';

export async function getEffectiveUserPlan(userId: string, isOwner = false) {
  if (isOwner) {
    return {
      ...getPlan('unlimited'),
      owner: true,
      limits: {
        maxProjects: 2_147_483_647,
        monthlyBuilds: 2_147_483_647,
        monthlyImageCredits: Number.MAX_SAFE_INTEGER,
      },
    };
  }
  const db = adminSupabase();
  const { data } = await db.from('subscriptions')
    .select('plan,status,current_period_end,ends_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const periodEnd = data?.current_period_end || data?.ends_at;
  const active = Boolean(data && (!periodEnd || new Date(periodEnd) > new Date()));
  const key = active ? String(data?.plan || 'free').toLowerCase() : 'free';
  const planKey = (key in { free:1, standard:1, pro:1, unlimited:1, business:1 } ? key : 'free') as PlanKey | 'free';
  return { ...getPlan(planKey), owner: false, subscription: active ? data : null };
}

export function planAllows(plan: ReturnType<typeof getPlan>, feature: string) {
  return plan.features.includes(feature) || plan.features.includes('advanced-coding') && feature === 'coding';
}

/** Mobile and game plans remain disabled until an operator explicitly opts higher tiers in. */
export function planAllowsCloudProject(
  plan: Awaited<ReturnType<typeof getEffectiveUserPlan>>,
  projectType: 'mobile_app' | 'game',
  isOwner = false,
) {
  if (isOwner) return true;
  if (plan.key === 'standard' || plan.key === 'free') return false;
  const variable = projectType === 'mobile_app' ? 'LEONARDX_MOBILE_APP_PLANS' : 'LEONARDX_GAME_PLANS';
  const configuredPlans = new Set((process.env[variable] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  const publicKey = plan.key === 'unlimited' ? 'business' : plan.key;
  return configuredPlans.has(publicKey);
}
