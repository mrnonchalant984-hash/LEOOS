import { adminSupabase } from '@/lib/auth';
import { getPlan, type PlanKey } from '@/lib/pricing';

export async function getEffectiveUserPlan(userId: string, isOwner = false) {
  if (isOwner) return { ...getPlan('unlimited'), owner: true };
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
