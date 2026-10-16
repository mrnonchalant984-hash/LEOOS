import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Agent Studio is restricted to active paid Developer API plans and account-owned agents', async () => {
  const access = await read('lib/developer-agents.ts');
  const collection = await read('app/api/developers/agents/route.ts');
  const item = await read('app/api/developers/agents/[id]/route.ts');
  assert.match(access, /\.eq\('user_id', userId\)/);
  assert.match(access, /plan\.audience !== 'developer'/);
  assert.match(collection, /active paid Developer API plan is required/);
  assert.match(collection, /\.eq\('user_id', access\.context\.user\.id\)/);
  assert.match(item, /\.eq\('id', id\)\.eq\('user_id', access\.context\.user\.id\)/);
});

test('custom agents can run only currently approved account read-only tools and are metered', async () => {
  const chat = await read('app/api/chat/route.ts');
  const tools = await read('app/api/chat/tools/route.ts');
  const migration = await read('supabase/migrations/20261014121000_developer_custom_agents.sql');
  assert.match(chat, /customAgent\.allowed_tools\.includes\(tool\.name\)/);
  assert.match(chat, /customAgent\.instructions/);
  assert.match(chat, /consume_api_request_credit/);
  assert.match(chat, /usage\.totalTokens/);
  assert.match(chat, /settle_api_request_credit/);
  assert.match(chat, /refund_api_request_credit/);
  assert.match(tools, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.developer_custom_agents from public, anon, authenticated/i);
});

test('platform owner bypasses Developer API subscriptions, credits, and paid Agent Studio gates', async () => {
  const access = await read('lib/developer-agents.ts');
  const apiAuth = await read('lib/api-auth.ts');
  const keys = await read('app/api/developers/api-keys/route.ts');
  const ownerPlan = await read('lib/plan-access.ts');
  const status = await read('app/api/developers/billing/status/route.ts');
  const checkout = await read('app/api/developers/billing/checkout/route.ts');
  assert.match(access, /if \(isPlatformOwner\(profile\)\)/);
  assert.match(apiAuth, /if \(ctx\.owner\) return \{ ok: true as const/);
  assert.match(keys, /const owner = isPlatformOwner\(ctx\.profile\)/);
  assert.match(ownerPlan, /monthlyBuilds: 2_147_483_647/);
  assert.match(status, /owner: true/);
  assert.match(checkout, /checkout_required: false/);
});
