import { NextResponse } from 'next/server';
import { API_PLAN_CATALOG, ENTERPRISE_API_PLAN, API_PLAN_CURRENCIES, API_CREDITS_PER_1000_TOKENS } from '@/lib/api-plan-catalog';

export async function GET() {
  return NextResponse.json({
    product: 'LeonardX Developer API',
    billing_model: 'monthly_subscription_with_included_usage_credits',
    currencies: API_PLAN_CURRENCIES,
    usage_metering: { credits_per_1000_tokens: API_CREDITS_PER_1000_TOKENS, measured_from_provider_usage: true, metadata_endpoints_cost_credits: false },
    plans: API_PLAN_CATALOG,
    enterprise: ENTERPRISE_API_PLAN,
    docs_url: '/docs/api',
    checkout_url: '/api/developers/billing/checkout',
    note: 'API keys may be created for free. Billable API execution requires an active paid plan and available credits.',
  }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
