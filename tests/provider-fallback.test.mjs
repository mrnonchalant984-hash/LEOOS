import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError, resolveModel } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, getSafeFallbackModel, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('uses a configured alternate Gemini model after transient failure', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback('google/gemini-3.8-flash', 'google/gemini-3.1-flash-lite', async model => {
    calls.push(model);
    if (calls.length === 1) throw new ModelProviderError('rate limited', 429);
    return { text: 'fallback response' };
  }, () => true);
  assert.deepEqual(calls, ['google/gemini-3.8-flash', 'google/gemini-3.1-flash-lite']);
  assert.equal(result.model, 'google/gemini-3.1-flash-lite');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'fallback response');
});

test('does not replay a failed model turn after a tool side effect started', async () => {
  const calls = [];
  let sideEffectStarted = false;
  await assert.rejects(generateWithExplicitFallback(
    'google/gemini-3.8-flash',
    'google/gemini-3.1-flash-lite',
    async model => {
      calls.push(model);
      sideEffectStarted = true;
      throw new ModelProviderError('response failed after tool call', 503);
    },
    () => true,
    { shouldFallbackOnError: () => !sideEffectStarted },
  ), /response failed after tool call/);
  assert.deepEqual(calls, ['google/gemini-3.8-flash']);
});

test('respects the configured maximum number of safe fallback attempts', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback(
    'google/gemini-3.8-flash',
    'google/gemini-3.1-flash-lite',
    async model => {
      calls.push(model);
      if (calls.length < 3) throw new ModelProviderError('temporary provider failure', 503);
      return { text: 'recovered' };
    },
    () => true,
    { maxFallbackAttempts: 2 },
  );
  assert.deepEqual(calls, [
    'google/gemini-3.8-flash',
    'google/gemini-3.1-flash-lite',
    'google/gemini-3.1-flash-lite',
  ]);
  assert.equal(result.result.text, 'recovered');
});

test('does not retry the same fallback after an authorization failure', async () => {
  const calls = [];
  await assert.rejects(generateWithExplicitFallback(
    'google/gemini-3.8-flash',
    'google/gemini-3.1-flash-lite',
    async model => {
      calls.push(model);
      throw new ModelProviderError('fallback credential rejected', 403);
    },
    () => true,
    { maxFallbackAttempts: 2 },
  ), /fallback credential rejected/);
  assert.deepEqual(calls, ['google/gemini-3.8-flash', 'google/gemini-3.1-flash-lite']);
});

test('rejects non-Gemini primary models before calling a provider', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-3.1-flash-lite', async () => { calls++; }, () => true), /Only Gemini/i);
  assert.equal(calls, 0);
  assert.throws(() => resolveModel('anthropic/claude-3-5-haiku-latest'), /Only Gemini/i);
});

test('retries network failures only once and treats client errors as non-retryable', () => {
  assert.equal(isRetryableProviderFailure(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), true);
});

test('does not retry when fallback is unavailable and logs only safe metadata', async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(generateWithExplicitFallback('google/gemini-3.8-flash', 'google/gemini-3.1-flash-lite', async model => {
      throw new ModelProviderError(model.includes('3.8') ? 'primary unavailable: do-not-log-this' : 'fallback unavailable', 503);
    }, () => true), /fallback unavailable/);
    assert.ok(logs.some(line => line.includes('leo.ai.fallback.failure')));
    assert.ok(logs.every(line => !line.includes('do-not-log-this')));
  } finally { console.info = originalInfo; }
});

test('ignores a non-catalogued Gemini 2.5 Flash fallback and selects a listed model', () => {
  assert.equal(
    getSafeFallbackModel('google/gemini-3.8-flash', 'google/gemini-2.5-flash', false, () => true),
    'google/gemini-3.1-flash-lite',
  );
});
