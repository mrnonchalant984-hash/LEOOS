import { NextResponse } from 'next/server';
import {
  API_CREDIT_PROVIDER_COST_USD,
  API_MODEL_PRICING,
  API_MODEL_PRICING_REVIEWED_ON,
  API_MODEL_PRICING_SOURCE,
  API_PLAN_CATALOG,
  ENTERPRISE_API_PLAN,
  API_PLAN_CURRENCIES,
} from '@/lib/api-plan-catalog';

export async function GET() {
  return NextResponse.json({
    product: 'LeonardX Developer API',
    billing_model: 'monthly_subscription_with_included_usage_credits',
    currencies: API_PLAN_CURRENCIES,
    usage_metering: {
      credit_provider_cost_usd: API_CREDIT_PROVIDER_COST_USD,
      provider_rates_usd_per_million_tokens: API_MODEL_PRICING,
      rates_reviewed_on: API_MODEL_PRICING_REVIEWED_ON,
      rates_source: API_MODEL_PRICING_SOURCE,
      formula: 'credits = max(1, ceil((input_tokens * input_rate + output_tokens * output_rate) / 1000000 / credit_provider_cost_usd))',
      measured_from_provider_usage: true,
      metadata_endpoints_cost_credits: false,
    },
    plans: API_PLAN_CATALOG,
    enterprise: ENTERPRISE_API_PLAN,
    docs_url: '/docs/api',
    checkout_url: '/api/developers/billing/checkout',
    note: 'API keys may be created for free. Billable API execution requires an active paid plan and available credits.',
  }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
