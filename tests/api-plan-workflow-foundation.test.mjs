import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { API_PLAN_CATALOG, ENTERPRISE_API_PLAN, API_PLAN_CHECKOUT_ENABLED } from '../lib/api-plan-catalog.ts';

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
  assert.match(route, /credits_per_1000_tokens/);
  assert.match(route, /active paid plan and available credits/);
  assert.doesNotMatch(route, /checkout_enabled|intended quotas/i);
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
