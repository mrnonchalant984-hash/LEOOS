import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryProviderRequest } from '../lib/ai/provider-retry.ts';

test('retries transient Gemini 429 responses with bounded exponential backoff and jitter', async () => {
  const delays = [];
  let calls = 0;
  const result = await retryProviderRequest(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error('quota exceeded'), { status: 429 });
    return 'ok';
  }, { random: () => 0.5, sleep: async delay => delays.push(delay), baseDelayMs: 400, maxDelayMs: 4_000 });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [400, 800]);
});

test('honours Retry-After for rate limited responses', async () => {
  const delays = [];
  let calls = 0;
  await retryProviderRequest(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429, headers: new Headers({ 'retry-after': '2' }) });
    return true;
  }, { sleep: async delay => delays.push(delay) });
  assert.deepEqual(delays, [2_000]);
});

test('does not retry permanent client errors and stops after the configured attempt limit', async () => {
  let calls = 0;
  await assert.rejects(retryProviderRequest(async () => {
    calls += 1;
    throw Object.assign(new Error('bad request'), { status: 400 });
  }, { sleep: async () => {} }), /bad request/);
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(retryProviderRequest(async () => {
    calls += 1;
    throw Object.assign(new Error('still rate limited'), { status: 429 });
  }, { maxAttempts: 2, sleep: async () => {} }), /still rate limited/);
  assert.equal(calls, 2);
});

test('does not begin another retry after cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(retryProviderRequest(async () => {
    calls += 1;
    throw Object.assign(new Error('busy'), { status: 503 });
  }, { signal: controller.signal, sleep: async (_delay, signal) => {
    controller.abort(new Error('cancelled'));
    if (signal?.aborted) throw signal.reason;
  } }), /cancelled/);
  assert.equal(calls, 1);
});
