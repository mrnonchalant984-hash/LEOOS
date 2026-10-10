import test from 'node:test';
import assert from 'node:assert/strict';
import { LeoClient, LeoApiError, LeoRateLimitError, verifyWebhookSignature } from '../packages/sdk/src/index.ts';
import { signatureHeader, generateWebhookSecret } from '../lib/webhooks-core.ts';
import { appendScratchpadEntry, createScratchpadManifest, isAgentPathAllowed, validateScratchpadManifest } from '../packages/sdk/src/orchestration.ts';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('sends bearer key to the right URL and returns parsed data', async () => {
  let seen;
  const leo = new LeoClient({ apiKey: 'leo_live_abc', baseUrl: 'https://api.example.com/', fetch: async (url, init) => { seen = { url: String(url), auth: init.headers.authorization }; return json(200, { data: [{ id: '1' }], request_id: 'r1' }); } });
  const out = await leo.projects.list();
  assert.equal(seen.url, 'https://api.example.com/api/v1/projects');
  assert.equal(seen.auth, 'Bearer leo_live_abc');
  assert.equal(out.data[0].id, '1');
});
test('project status uses a narrow authenticated status endpoint', async () => {
  let seen;
  const leo = new LeoClient({ apiKey: 'leo_live_abc', baseUrl: 'https://api.example.com', fetch: async (url) => { seen = String(url); return json(200, { data: { id: 'a/b', status: 'draft' }, request_id: 'r1' }); } });
  const result = await leo.projects.status('a/b');
  assert.equal(seen, 'https://api.example.com/api/v2/projects/a%2Fb/status');
  assert.equal(result.data.status, 'draft');
});
test('API errors carry status, code and request id', async () => {
  const leo = new LeoClient({ apiKey: 'k', fetch: async () => json(403, { error: { code: 'insufficient_scope', message: 'nope', request_id: 'r2' } }, { 'x-request-id': 'r2' }) });
  await assert.rejects(() => leo.projects.list(), e => e instanceof LeoApiError && e.status === 403 && e.code === 'insufficient_scope' && e.requestId === 'r2');
});
test('429 becomes LeoRateLimitError with retry-after', async () => {
  const leo = new LeoClient({ apiKey: 'k', fetch: async () => json(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'retry-after': '60' }) });
  await assert.rejects(() => leo.projects.list(), e => e instanceof LeoRateLimitError && e.retryAfterSeconds === 60 && e.status === 429);
});
test('non-JSON error bodies still produce a LeoApiError', async () => {
  const leo = new LeoClient({ apiKey: 'k', fetch: async () => new Response('<html>bad gateway</html>', { status: 502 }) });
  await assert.rejects(() => leo.projects.list(), e => e instanceof LeoApiError && e.status === 502);
});
test('constructor requires an apiKey', () => { assert.throws(() => new LeoClient({})); });
test('SDK verifies signatures produced by the server signer, and rejects tampering', () => {
  const secret = generateWebhookSecret(), body = '{"type":"webhook.test"}', now = 1_800_000_000;
  const header = signatureHeader(secret, body, now);
  assert.equal(verifyWebhookSignature(secret, header, body, { nowSeconds: now }), true);
  assert.equal(verifyWebhookSignature(secret, header, body + 'x', { nowSeconds: now }), false);
  assert.equal(verifyWebhookSignature(secret, header, body, { nowSeconds: now + 400 }), false);
  assert.equal(verifyWebhookSignature(secret, undefined, body), false);
});

test('agent directory boundaries reject path traversal and out-of-scope writes', () => {
  assert.equal(isAgentPathAllowed('database', 'supabase/migrations/001.sql'), true);
  assert.equal(isAgentPathAllowed('database', 'components/ui/button.tsx'), false);
  assert.equal(isAgentPathAllowed('ui', 'components/ui/button.tsx'), true);
  assert.equal(isAgentPathAllowed('ui', 'components/button.tsx'), false);
  assert.equal(isAgentPathAllowed('ui', '../supabase/config.toml'), false);
});

test('scratchpad contracts accept bounded handoff metadata and reject unsafe paths', () => {
  const empty = createScratchpadManifest();
  const updated = appendScratchpadEntry(empty, { id: 'e1', taskId: 't1', agent: 'ui', createdAt: new Date().toISOString(), summary: 'Added a button', changedPaths: ['components/ui/button.tsx'], validation: { status: 'passed', checks: ['typecheck'] } });
  assert.equal(validateScratchpadManifest(updated), true);
  assert.equal(updated.entries[0].changedPaths[0], '/components/ui/button.tsx');
  assert.throws(() => appendScratchpadEntry(empty, { id: 'e2', taskId: 't1', agent: 'ui', createdAt: '', summary: 'unsafe', changedPaths: ['../../.env'], validation: { status: 'not-run', checks: [] } }));
});
