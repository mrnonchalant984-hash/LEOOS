import test from 'node:test';
import assert from 'node:assert/strict';
import { LeoClient, LeoApiError, LeoRateLimitError, verifyWebhookSignature } from '../packages/sdk/src/index.ts';
import { signatureHeader, generateWebhookSecret } from '../lib/webhooks-core.ts';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('sends bearer key to the right URL and returns parsed data', async () => {
  let seen;
  const leo = new LeoClient({ apiKey: 'leo_live_abc', baseUrl: 'https://api.example.com/', fetch: async (url, init) => { seen = { url: String(url), auth: init.headers.authorization }; return json(200, { data: [{ id: '1' }], request_id: 'r1' }); } });
  const out = await leo.projects.list();
  assert.equal(seen.url, 'https://api.example.com/api/v1/projects');
  assert.equal(seen.auth, 'Bearer leo_live_abc');
  assert.equal(out.data[0].id, '1');
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
