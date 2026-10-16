import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public model and message endpoints enforce scope, bounded input, active billing, and measured token settlement', async () => {
  const models = await read('app/api/v1/models/route.ts');
  const messages = await read('app/api/v1/messages/route.ts');
  const auth = await read('lib/api-auth.ts');
  assert.match(models, /withApiKey\(req, 'read'/);
  assert.match(messages, /withApiKey\(req, 'write'/);
  assert.match(messages, /MAX_INPUT_CHARS = 40_000/);
  assert.match(messages, /MAX_OUTPUT_TOKENS = 4096/);
  assert.match(messages, /authorizeBillableUsage/);
  assert.match(messages, /settleBillableUsage/);
  assert.match(messages, /text\/event-stream/);
  assert.match(messages, /stream_options: \{ include_usage: true \}/);
  assert.match(messages, /completion\.usage/);
  assert.match(messages, /providerStreamAccepted && auth\.reservedCredits/);
  assert.match(auth, /!ctx\.providerUsageMeasured/);
  assert.match(auth, /consume_api_request_credit/);
  assert.match(auth, /settle_api_request_credit/);
  const sdk = await read('packages/sdk/src/index.ts');
  assert.match(sdk, /stream: \(input: .*=> this\.streamMessages/);
  assert.match(sdk, /private async \*streamMessages/);
  const authCore = auth.slice(auth.indexOf('export async function authenticateApiKey'), auth.indexOf('export async function authorizeBillableUsage'));
  assert.doesNotMatch(authCore, /consume_api_request_credit/);
});

test('API usage ledger can reconcile reservations and credit metadata endpoints are free', async () => {
  const migration = await read('supabase/migrations/20261013160000_api_inference_metering.sql');
  const catalog = await read('lib/api-plan-catalog.ts');
  const chat = await read('app/api/chat/route.ts');
  assert.match(migration, /create or replace function public\.settle_api_request_credit/);
  assert.match(migration, /for update/);
  assert.match(catalog, /calculateApiCredits/);
  assert.match(catalog, /metadata endpoints do not consume usage credits/i);
  assert.match(chat, /calculateApiCredits\(customAgentBillingModel, usage\.inputTokens, usage\.outputTokens\)/);
  assert.match(chat, /if \(!owner\) \{/);
  assert.match(chat, /isProviderConfigured\('openai'\)/);
  assert.doesNotMatch(chat, /API_CREDITS_PER_1000_TOKENS/);
});

test('CLI exposes the public model, chat, and usage commands without a self dependency', async () => {
  const cli = await read('packages/cli/src/index.mjs');
  const pkg = JSON.parse(await read('packages/cli/package.json'));
  assert.match(cli, /leo models list/);
  assert.match(cli, /\/api\/v1\/messages/);
  assert.match(cli, /\/api\/v1\/usage/);
  assert.equal(pkg.dependencies['@leo-os/cli'], undefined);
});

test('webhooks expose only wired event types and pin validated DNS for HTTPS delivery', async () => {
  const core = await read('lib/webhooks-core.ts');
  const delivery = await read('lib/webhooks.ts');
  assert.match(core, /project\.created/);
  assert.match(core, /project\.deployed/);
  assert.match(core, /api\.usage\.completed/);
  assert.match(delivery, /sendPinnedWebhook/);
  assert.match(delivery, /lookup: pinnedLookup/);
  assert.match(delivery, /claimed_at: immediate \? queuedAt : null/);
});
