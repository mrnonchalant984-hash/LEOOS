import type { PlanKey } from '@/lib/pricing';

// Specialist execution is intentionally narrower than the UI's overall feature list.
// Generation tools and browser/computer-use stay on their dedicated, separately authorized endpoints.
const STANDARD_AGENT_IDS = [
  'leo-manager', 'code-review', 'design',
  'writing', 'translation', 'tutor', 'content', 'copywriting', 'marketing',
  'security', 'documentation',
] as const;
const PRO_AGENT_IDS = [
  ...STANDARD_AGENT_IDS, 'developer', 'debugging', 'frontend', 'backend',
  'seo', 'accessibility', 'performance', 'project-manager', 'decision',
] as const;

export function getAllowedAgentIds(plan: PlanKey | string, isOwner = false): string[] | null {
  if (isOwner) return null; // null means the owner keeps the complete existing registry.
  if (plan === 'business' || plan === 'unlimited') return [...PRO_AGENT_IDS];
  if (plan === 'pro') return [...STANDARD_AGENT_IDS];
  return [];
}

export function canUseManualAgents(plan: PlanKey | string, isOwner = false) {
  return isOwner || plan === 'pro' || plan === 'business' || plan === 'unlimited';
}

export function agentAllowed(agentId: string, plan: PlanKey | string, isOwner = false) {
  const allowed = getAllowedAgentIds(plan, isOwner);
  return allowed === null || allowed.includes(agentId);
}
