import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  API_CREDIT_PROVIDER_COST_USD,
  API_MODEL_PRICING,
  API_MODEL_PRICING_REVIEWED_ON,
  API_PLAN_CATALOG,
  ENTERPRISE_API_PLAN,
  API_PLAN_CHECKOUT_ENABLED,
  calculateApiCredits,
  getSupportedApiModels,
  isApiModel,
} from '../lib/api-plan-catalog.ts';

test('API plans have separate paid tiers and enterprise custom pricing', () => {
  assert.deepEqual(API_PLAN_CATALOG.map(p => p.key), ['developer','builder','growth','scale','business_starter','business_pro','business_scale']);
  assert.ok(API_PLAN_CATALOG.slice(1).every(p => p.monthlyNgn > 0 && p.includedCredits > 0));
  assert.ok(API_PLAN_CATALOG.filter(p => p.audience === 'developer').length >= 3);
  assert.ok(API_PLAN_CATALOG.filter(p => p.audience === 'business').length >= 3);
  assert.equal(ENTERPRISE_API_PLAN.key, 'enterprise');
  assert.equal(ENTERPRISE_API_PLAN.pricing, 'custom');
});

test('API checkout is enabled and all non-free tiers use monthly subscriptions with included credits', () => {
  assert.equal(API_PLAN_CHECKOUT_ENABLED, true);
  assert.ok(API_PLAN_CATALOG.slice(1).every(p => p.includedCredits > 0));
});

test('published model prices are costed from official OpenAI standard input/output rates', () => {
  assert.equal(API_MODEL_PRICING_REVIEWED_ON, '2026-10-16');
  assert.deepEqual(API_MODEL_PRICING['gpt-4o-mini'], {
    inputUsdPerMillionTokens: 0.15,
    outputUsdPerMillionTokens: 0.6,
  });
  assert.equal(API_CREDIT_PROVIDER_COST_USD, 0.0006);
  assert.equal(calculateApiCredits('gpt-4o-mini', 1_000_000, 0), 250);
  assert.equal(calculateApiCredits('gpt-4o-mini', 0, 1_000_000), 1_000);
  assert.equal(calculateApiCredits('gpt-4o-mini', 1_000_000, 1_000_000), 1_250);
  assert.equal(calculateApiCredits('unpriced-model', 1_000_000, 1_000_000), null);
  assert.deepEqual(getSupportedApiModels('gpt-4o-mini,unpriced-model'), ['gpt-4o-mini']);
  assert.deepEqual(getSupportedApiModels('unpriced-model'), []);
  assert.equal(isApiModel('gpt-4o-mini'), true);
  assert.equal(isApiModel('gpt-4o'), false);
  assert.ok(calculateApiCredits('gpt-4o-mini', 160_000 + 50 * 16, 4096) <= 100);
});

test('provider-priced monthly usage remains below each plan price under a conservative NGN FX stress rate', () => {
  const ngnPerUsdStressRate = 2_500;
  for (const plan of API_PLAN_CATALOG.slice(1)) {
    const maximumProviderCostUsd = plan.includedCredits * API_CREDIT_PROVIDER_COST_USD;
    assert.ok(maximumProviderCostUsd < plan.monthlyUsd, `${plan.key} USD price must exceed its provider cost ceiling`);
    assert.ok(maximumProviderCostUsd < plan.monthlyNgn / ngnPerUsdStressRate, `${plan.key} NGN price must exceed its provider cost ceiling`);
  }
});

test('workflow migration has durable queue leases, idempotency, RLS, and bounded claims', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261013130000_api_enterprise_workflow_foundation.sql', import.meta.url), 'utf8');
  for (const token of ['workflow_jobs','lease_expires_at','for update skip locked','unique (workflow_id,user_id,idempotency_key)','enable row level security','service_role','api_enterprise_inquiries','enqueue_due_workflows','next_run_at']) assert.ok(sql.toLowerCase().includes(token.toLowerCase()), `missing ${token}`);
});

test('workflow worker is gated and executes no arbitrary code or browser/generation tools', async () => {
  const worker = await readFile(new URL('../app/api/internal/workflow-worker/route.ts', import.meta.url), 'utf8');
  const runs = await readFile(new URL('../app/api/workflows/[id]/runs/route.ts', import.meta.url), 'utf8');
  assert.match(worker, /WORKFLOW_WORKER_ENABLED !== 'true'/);
  assert.match(worker, /WORKFLOW_WORKER_SECRET/);
  assert.match(worker, /enqueue_due_workflows/);
  assert.match(worker, /isBrowserAgent/);
  assert.match(worker, /agent\.id !== 'image'/);
  assert.match(runs, /canUseManualAgents/);
});


test('customer-facing pages do not expose internal worker or checkout implementation notes', async () => {
  const workflowPage = await readFile(new URL('../app/workflows/page.tsx', import.meta.url), 'utf8');
  const apiPricingPage = await readFile(new URL('../app/developers/pricing/page.tsx', import.meta.url), 'utf8');
  const mainPricingPage = await readFile(new URL('../app/pricing/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workflowPage, /lease-safe claim|protected worker|dead-letter|staging tests|worker and safety status|Apply the workflow foundation migration/i);
  assert.doesNotMatch(apiPricingPage, /checkout remains disabled|intended plan allowances|Configured price|planned rate target|concurrency target/i);
  assert.doesNotMatch(mainPricingPage, /not yet enabled for customer plans|not yet metered|separately configured platform-credit rate/i);
});

test('public API plan endpoint publishes the supported catalog and free-key billing gate', async () => {
  const route = await readFile(new URL('../app/api/v1/billing/plans/route.ts', import.meta.url), 'utf8');
  assert.match(route, /API_PLAN_CATALOG/);
  assert.match(route, /provider_rates_usd_per_million_tokens/);
  assert.match(route, /credit_provider_cost_usd/);
  assert.match(route, /active paid plan and available credits/);
  assert.doesNotMatch(route, /checkout_enabled|intended quotas/i);
});

test('Developer API only exposes models with a reviewed provider rate and charges actual input/output usage', async () => {
  const models = await readFile(new URL('../app/api/v1/models/route.ts', import.meta.url), 'utf8');
  const messages = await readFile(new URL('../app/api/v1/messages/route.ts', import.meta.url), 'utf8');
  const catalog = await readFile(new URL('../lib/api-plan-catalog.ts', import.meta.url), 'utf8');
  assert.match(models, /getSupportedApiModels/);
  assert.match(messages, /calculateApiCredits\(model, inputTokenCeiling, maxTokensRaw\)/);
  assert.match(messages, /inputTokenCeiling = inputBytes \+ messages\.length \* 16/);
  assert.match(messages, /calculateApiCredits\(model, inputTokens, outputTokens\)/);
  assert.match(catalog, /requested\.filter\(isApiModel\)/);
});

test('API key journey keeps free key creation separate from paid execution and offers pricing after copying', async () => {
  const keysPage = await readFile(new URL('../app/api-keys/page.tsx', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../lib/api-auth.ts', import.meta.url), 'utf8');
  const callback = await readFile(new URL('../app/payment/callback/page.tsx', import.meta.url), 'utf8');
  assert.match(keysPage, /copyAndContinue/);
  assert.match(keysPage, /\/developers\/pricing/);
  assert.match(auth, /authorizeBillableUsage/);
  assert.match(auth, /BILLING_REQUIRED/);
  assert.match(auth, /API_CREDITS_EXHAUSTED/);
  assert.match(auth, /consume_api_rate_limit/);
  assert.doesNotMatch(auth.slice(auth.indexOf('export async function authenticateApiKey'), auth.indexOf('export async function authorizeBillableUsage')), /consume_api_request_credit/);
  assert.match(callback, /verifyApiPlan/);
  assert.match(callback, /\/api\/developers\/billing\/verify/);
});
