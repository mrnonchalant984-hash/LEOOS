import { NextResponse } from 'next/server';
import {
  BILLING_PERIODS,
  PLAN_CURRENCY,
  PUBLIC_PAID_PLAN_KEYS,
  getPlanPrice,
  publicPlanToInternal,
} from '@/lib/pricing';

export async function GET() {
  const prices: Record<string, number> = {};
  for (const publicPlan of PUBLIC_PAID_PLAN_KEYS) {
    for (const period of BILLING_PERIODS) {
      const amountKobo = getPlanPrice(publicPlanToInternal[publicPlan], period);
      prices[`${publicPlan}_${period}`] = amountKobo;
      // Keep the old internal key in the response for existing pricing clients.
      if (publicPlan === 'business') prices[`unlimited_${period}`] = amountKobo;
    }
  }

  return NextResponse.json({ currency: PLAN_CURRENCY, prices }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
