import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError, resolveModel } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, getSafeFallbackModel, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('uses the free Gemini 2.5 Flash fallback after a transient primary failure', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback('google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash', async model => {
    calls.push(model);
    if (calls.length === 1) throw new ModelProviderError('rate limited', 429);
    return { text: 'fallback response' };
  }, () => true);
  assert.deepEqual(calls, ['google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash']);
  assert.equal(result.model, 'google/gemini-2.5-flash');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'fallback response');
});

test('does not replay a failed model turn after a tool side effect started', async () => {
  const calls = [];
  let sideEffectStarted = false;
  await assert.rejects(generateWithExplicitFallback(
    'google/gemini-3.1-flash-lite',
    'google/gemini-2.5-flash',
    async model => {
      calls.push(model);
      sideEffectStarted = true;
      throw new ModelProviderError('response failed after tool call', 503);
    },
    () => true,
    { shouldFallbackOnError: () => !sideEffectStarted },
  ), /response failed after tool call/);
  assert.deepEqual(calls, ['google/gemini-3.1-flash-lite']);
});

test('respects the configured maximum number of safe fallback attempts', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback(
    'google/gemini-3.1-flash-lite',
    'google/gemini-2.5-flash',
    async model => {
      calls.push(model);
      if (calls.length < 3) throw new ModelProviderError('temporary provider failure', 503);
      return { text: 'recovered' };
    },
    () => true,
    { maxFallbackAttempts: 2 },
  );
  assert.deepEqual(calls, [
    'google/gemini-3.1-flash-lite',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-flash',
  ]);
  assert.equal(result.result.text, 'recovered');
});

test('does not retry the same fallback after an authorization failure', async () => {
  const calls = [];
  await assert.rejects(generateWithExplicitFallback(
    'google/gemini-3.1-flash-lite',
    'google/gemini-2.5-flash',
    async model => {
      calls.push(model);
      if (calls.length === 1) throw new ModelProviderError('primary temporarily unavailable', 503);
      throw new ModelProviderError('fallback credential rejected', 403);
    },
    () => true,
    { maxFallbackAttempts: 2 },
  ), /fallback credential rejected/);
  assert.deepEqual(calls, ['google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash']);
});

test('does not hide authentication, permission, or model-not-found failures behind fallback', () => {
  assert.equal(isRetryableProviderFailure(new ModelProviderError('unauthorized', 401)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('forbidden', 403)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('rate limited', 429)), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('temporary outage', 503)), true);
});

test('rejects paid or unapproved model identifiers before calling a provider', async () => {
  let calls = 0;
  await assert.rejects(
    generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-2.5-flash', async () => { calls++; }, () => true),
    /Only Gemini/i,
  );
  assert.equal(calls, 0);
  assert.throws(() => resolveModel('gemini-3.5-flash-lite'), /free-tier Gemini registry/i);
  assert.throws(() => resolveModel('gemini-2.5-flash-lite'), /free-tier Gemini registry/i);
  assert.equal(resolveModel('gemini-3.1-flash-lite').model, 'gemini-3.1-flash-lite');
});

test('retries network failures only and treats client errors as non-retryable', () => {
  assert.equal(isRetryableProviderFailure(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
});

test('logs fallback metadata without exposing the primary provider error text', async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(generateWithExplicitFallback(
      'google/gemini-3.1-flash-lite',
      'google/gemini-2.5-flash',
      async model => {
        throw new ModelProviderError(model.includes('3.1') ? 'primary unavailable: do-not-log-this' : 'fallback unavailable', 503);
      },
      () => true,
    ), /primary model gemini-3.1-flash-lite failed.*fallback model gemini-2.5-flash also failed/);
    assert.ok(logs.some(line => line.includes('leo.ai.fallback.failure')));
    assert.ok(logs.every(line => !line.includes('do-not-log-this')));
  } finally { console.info = originalInfo; }
});

test('selects only the approved free-tier fallback model', () => {
  assert.equal(
    getSafeFallbackModel('google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash', false, () => true),
    'google/gemini-2.5-flash',
  );
});
