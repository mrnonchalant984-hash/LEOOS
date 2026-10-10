import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivenessResponse } from '../lib/health.ts';

test('liveness response is generic, uncached, and carries a safe correlation id', async () => {
  const requestId = '90f7a5bc-0735-46eb-8f49-a56c5d1e4210';
  const response = createLivenessResponse(requestId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-request-id'), requestId);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('liveness response replaces malformed correlation ids and reveals no dependency state', async () => {
  const response = createLivenessResponse('Bearer private-secret');
  const body = await response.json();
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(body, { status: 'ok' });
  assert.equal(JSON.stringify(body).includes('secret'), false);
});
