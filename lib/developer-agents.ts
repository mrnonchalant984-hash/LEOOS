import 'server-only';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getApiPlan } from '@/lib/api-plan-catalog';

export type DeveloperCustomAgent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  allowed_tools: string[];
  created_at: string;
  updated_at: string;
};

export async function getActiveDeveloperPlan(userId: string) {
  const db = adminSupabase();
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role,email')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error('Developer plan access could not be verified.');
  if (isPlatformOwner(profile)) {
    return {
      key: 'owner',
      audience: 'developer',
      name: 'Platform Owner',
      includedCredits: null,
      features: ['Developer API access without a paid plan'],
    } as const;
  }

  const { data, error } = await db.from('api_plan_subscriptions')
    .select('plan_key,status,current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Developer plan access could not be verified.');
  const plan = data ? getApiPlan(data.plan_key) : null;
  if (!plan || plan.key === 'developer' || (plan.key !== 'enterprise' && (!('audience' in plan) || plan.audience !== 'developer'))) return null;
  return plan;
}

export async function getUserDeveloperAgent(userId: string, agentId: string) {
  const { data, error } = await adminSupabase().from('developer_custom_agents')
    .select('id,name,description,instructions,allowed_tools,created_at,updated_at')
    .eq('id', agentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Custom agent storage is unavailable. Apply the developer agent migration.');
  return data as DeveloperCustomAgent | null;
}
