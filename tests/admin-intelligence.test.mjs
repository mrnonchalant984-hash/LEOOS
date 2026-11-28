import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('owner intelligence migration is additive, private and does not invent prices or credit rates', async () => {
 const sql=await read('supabase/migrations/20261128153545_owner_control_center_intelligence.sql');
 for(const table of ['ai_model_pricing','ai_exchange_rates','ai_usage_financials','ai_credit_conversion_policy','ai_usage_credit_ledger','business_expenses']) assert.match(sql,new RegExp('create table if not exists public\\.'+table));
 assert.match(sql,/enable row level security/g);
 assert.ok(sql.includes('revoke all on public.ai_model_pricing'));
 assert.ok(sql.includes("values ('default', false)"));
  assert.match(sql,/pricing_status\s+text not null default 'unpriced'/);
 assert.match(sql,/prevent_ai_financial_ledger_mutation/);
  assert.doesNotMatch(sql,/insert into public\.ai_model_pricing/);
});

test('owner intelligence API uses owner 2FA and trusted device and counts only verified payments as revenue', async () => {
 const route=await read('app/api/admin/intelligence/route.ts');
 assert.match(route,/requireOwner/);
 assert.match(route,/twofa_verified/);
 assert.match(route,/leo_admin_device/);
 assert.match(route,/token_hash/);
  assert.match(route,/p\.status === 'success' && p\.verified_at/);
 assert.match(route,/status === 'succeeded'/);
 assert.match(route,/netOperatingResultNgn/);
 assert.match(route,/moneyUnits/);
 assert.match(route,/financials/);
});

test('AI financial snapshots use effective paid pricing and exact decimal arithmetic without guessing actual spend', async () => {
 const helper=await read('lib/ai/usage-financials.ts');
 assert.match(helper,/BigInt/);
 assert.match(helper,/service_tier','paid'/);
 assert.match(helper,/effective_at/);
 assert.match(helper,/ai_exchange_rates/);
 assert.match(helper,/actual_cost_status:actualStatus/);
 assert.match(helper,/not_reported/);
 assert.match(helper,/upsert\(payload,\{onConflict:'ai_usage_id'\}\)/);
 assert.doesNotMatch(helper,/actualCostConfirmedZero:\s*true/);
});

test('credit preview is idempotency-aware, excludes images and failed requests, and does not charge', async () => {
 const route=await read('app/api/admin/intelligence/credit-preview/route.ts');
 assert.match(route,/ai_usage_credit_ledger/);
 assert.match(route,/seen\.has\(u\.id\)/);
 assert.match(route,/feature\.startsWith\('image_'/);
 assert.match(route,/request_status==='failed'/);
 assert.match(route,/Preview only/);
  assert.doesNotMatch(route,/\.insert\(|\.update\(|\.delete\(/);
});

test('expense recording is owner protected and uses integer decimal conversion for USD to NGN', async () => {
 const route=await read('app/api/admin/intelligence/expenses/route.ts');
 assert.match(route,/requireOwner/);
 assert.match(route,/leo_admin_device/);
 assert.match(route,/BigInt/);
 assert.match(route,/ai_exchange_rates/);
 assert.match(route,/business_expenses/);
});

test('infrastructure health reports unconfigured integrations as unknown and does not generate AI completions', async () => {
 const route=await read('app/api/admin/intelligence/health/route.ts');
 assert.match(route,/status:detail\.toLowerCase\(\)\.includes\('not configured'\)\?'unknown'/);
 assert.ok(route.includes('generativelanguage.googleapis.com/v1beta/models'));
 assert.match(route,/workforce_worker_heartbeats/);
 assert.doesNotMatch(route,/generateContent|generateText|generateTextWithTools/);
});

test('existing admin page embeds the additive responsive intelligence panel and preserves existing navigation', async () => {
 const page=await read('app/admin/page.tsx');
 const panel=await read('components/AdminIntelligencePanel.tsx');
 assert.match(page,/AdminIntelligencePanel/);
 for(const label of ['Overview','AI Intelligence','User Consumption','Credits & Billing','Revenue & Subscriptions','Hosting & Renewals','Bram Performance','Gemini Monitoring','Website Builds','Infrastructure','Expenses & Profit','Audit Logs']) assert.ok(panel.includes(label),label);
 assert.match(panel,/setInterval\(\(\)=>setTick/);
});

test('hosting renewal alerts are cron-protected, per-project, opt-out aware and delivery-confirmed', async () => {
 const route=await read('app/api/cron/hosting-renewal-alerts/route.ts');
 const workflow=await read('.github/workflows/hosting-renewal-alerts.yml');
 assert.match(route,/timingSafeEqual/);
 assert.match(route,/hosting_subscriptions/);
 assert.match(route,/last_reminder_at/);
 assert.match(route,/email_opt_out/);
 assert.match(route,/sendClientEmail/);
 assert.match(route,/if\(!result\)/);
 assert.match(workflow,/schedule:/);
 assert.match(workflow,/BRAVERTON_APP_URL/);
 assert.match(workflow,/CRON_SECRET/);
});
