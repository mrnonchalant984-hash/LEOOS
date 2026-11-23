import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError, resolveModel } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, getSafeFallbackModel, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('does not retry the legacy Gemini 2.5 ID after it is normalized to the current model', async () => {
  const calls = [];
  await assert.rejects(generateWithExplicitFallback('google/gemini-3.5-flash-lite', 'google/gemini-2.5-flash-lite', async model => {
    calls.push(model);
    throw new ModelProviderError('primary unavailable', 503);
  }, () => true), /primary unavailable/);
  assert.deepEqual(calls, ['google/gemini-3.5-flash-lite']);
});

test('rejects non-Gemini primary models before calling a provider', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-2.5-flash-lite', async () => { calls++; }, () => true), /Only Gemini/i);
  assert.equal(calls, 0);
  assert.throws(() => resolveModel('anthropic/claude-3-5-haiku-latest'), /Only Gemini/i);
});

test('retries network failures only once and treats client errors as non-retryable', () => {
  assert.equal(isRetryableProviderFailure(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), true);
});

test('does not retry when the only available model fails', async () => {
  const calls = [];
  await assert.rejects(generateWithExplicitFallback('google/gemini-3.5-flash-lite', undefined, async model => {
    calls.push(model);
    throw new ModelProviderError('provider unavailable', 503);
  }, () => true), /provider unavailable/);
  assert.deepEqual(calls, ['google/gemini-3.5-flash-lite']);
});

test('does not advertise a legacy Gemini 2.5 fallback', () => {
  assert.equal(getSafeFallbackModel('google/gemini-3.5-flash-lite', 'google/gemini-2.5-flash', false, () => true), undefined);
});
