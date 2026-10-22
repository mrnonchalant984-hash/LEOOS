import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('uses only an explicitly selected configured fallback after a transient failure', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback('openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest', async model => {
    calls.push(model);
    if (calls.length === 1) throw new ModelProviderError('rate limited', 429);
    return { text: 'fallback response' };
  }, () => true);
  assert.deepEqual(calls, ['openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest']);
  assert.equal(result.model, 'anthropic/claude-3-5-haiku-latest');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'fallback response');
});

test('does not fall back for authentication or malformed-request errors', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest', async () => {
    calls++;
    throw new ModelProviderError('invalid API key', 401);
  }, () => true), /invalid API key/);
  assert.equal(calls, 1);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
});

test('does not retry when fallback is unavailable and retries network failures only once', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest', async () => {
    calls++;
    throw new ModelProviderError('provider unavailable', 503);
  }, () => false), /fallback provider \(anthropic\) is not configured/);
  assert.equal(calls, 1);
  const networkError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
  assert.equal(isRetryableProviderFailure(networkError), true);
});


test('treats missing provider models as retryable and uses Gemini for non-Google primaries when configured', async () => {
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
});
