import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import {
  BUDGET_OPTIONS,
  capabilityCatalog,
  detectExistingCapabilities,
  recommendOption,
  type BudgetTier,
  type CapabilityId,
} from '@/lib/capability-alternatives';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-alternatives', 60, 60);
  if (limited) return limited;

  const budget = (request.nextUrl.searchParams.get('budget') || 'free') as BudgetTier;
  const capability = request.nextUrl.searchParams.get('capability') as CapabilityId | null;
  const existing = detectExistingCapabilities();
  const catalog = capabilityCatalog(existing);
  const selected = capability ? catalog.filter((item) => item.capability === capability) : catalog;

  return NextResponse.json({
    budgetOptions: BUDGET_OPTIONS,
    existing,
    requirements: selected.map((requirement) => {
      const recommendation = recommendOption(requirement, ['free', 'low', 'moderate', 'professional', 'custom'].includes(budget) ? budget : 'free');
      return {
        ...requirement,
        recommendation: recommendation.option,
        recommendationReason: recommendation.reason,
        unavailablePaid: recommendation.unavailablePaid,
      };
    }),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
