import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, getSafeFallbackModel, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('uses a configured Gemini fallback after a transient failure', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-2.5-flash', async model => {
    calls.push(model);
    if (calls.length === 1) throw new ModelProviderError('rate limited', 429);
    return { text: 'fallback response' };
  }, () => true);
  assert.deepEqual(calls, ['openai/gpt-4o-mini', 'google/gemini-2.5-flash']);
  assert.equal(result.model, 'google/gemini-2.5-flash');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'fallback response');
});

test('does not fall back after authentication, authorization, missing-model, or malformed-request errors', async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-2.5-flash', async () => {
      calls++;
      throw new ModelProviderError('non-retryable provider error', status);
    }, () => true), /non-retryable provider error/);
    assert.equal(calls, 1, `status ${status} should not trigger a fallback`);
    assert.equal(isRetryableProviderFailure(new ModelProviderError('non-retryable provider error', status)), false);
  }
});

test('does not retry when fallback is unavailable and retries network failures only once', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-2.5-flash', async () => {
    calls++;
    throw new ModelProviderError('provider unavailable', 503);
  }, () => false), /fallback provider \(google\) is unavailable/);
  assert.equal(calls, 0);
  const networkError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
  assert.equal(isRetryableProviderFailure(networkError), true);
});


test('treats missing models as non-retryable and transient provider failures as retryable', async () => {
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('unauthorized', 401)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('rate limited', 429)), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('temporarily unavailable', 503)), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
});

test('routes directly to configured Gemini when the primary provider is not configured', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback(
    'openai/gpt-4o-mini',
    'gemini-2.5-flash',
    async model => { calls.push(model); return { text: 'Gemini answered' }; },
    provider => provider === 'google',
  );
  assert.deepEqual(calls, ['google/gemini-2.5-flash']);
  assert.equal(result.model, 'google/gemini-2.5-flash');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'Gemini answered');
});

test('uses a different Gemini model when Gemini itself is selected', async () => {
  const calls = [];
  const fallbackModel = getSafeFallbackModel(
    'google/gemini-2.5-flash',
    undefined,
    false,
    provider => provider === 'google' || provider === 'openai',
  );
  const result = await generateWithExplicitFallback(
    'google/gemini-2.5-flash',
    fallbackModel,
    async model => {
      calls.push(model);
      if (calls.length === 1) throw new ModelProviderError('Gemini unavailable', 503);
      return { text: 'Gemini backup answered' };
    },
    provider => provider === 'google' || provider === 'openai',
  );
  assert.deepEqual(calls, ['google/gemini-2.5-flash', 'google/gemini-3.8-flash']);
  assert.equal(result.model, 'google/gemini-3.8-flash');
  assert.equal(result.fallback_used, true);
});

test('rejects non-Gemini fallback models even when they are configured', async () => {
  await assert.rejects(generateWithExplicitFallback(
    'google/gemini-3.8-flash',
    'openai/gpt-4o-mini',
    async () => { throw new ModelProviderError('Gemini unavailable', 503); },
    () => true,
  ), /Gemini unavailable/);
});

test('does not fall back after primary provider authentication failure or expose its details in logs', async () => {
  const calls = [];
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(generateWithExplicitFallback(
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
      async model => {
        calls.push(model);
        throw new ModelProviderError('invalid API key: do-not-log-this', 401);
      },
      () => true,
    ), /invalid API key/);
    assert.deepEqual(calls, ['openai/gpt-4o-mini']);
    assert.equal(logs.length, 0);
    assert.ok(logs.every(line => !line.includes('do-not-log-this')));
  } finally {
    console.info = originalInfo;
  }
});

test('reports fallback failure with safe metadata and propagates the actual provider error', async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(generateWithExplicitFallback(
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
      async model => { throw new ModelProviderError(model.startsWith('openai/') ? 'primary unavailable' : 'Gemini unavailable', 503); },
      () => true,
    ), /Gemini unavailable/);
    assert.ok(logs.some(line => line.includes('leo.ai.fallback.failure')));
  } finally {
    console.info = originalInfo;
  }
});
