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

test('falls back for OpenAI exhausted-credit and quota errors even when SDK status shape differs', async () => {
  const calls = [];
  const quotaError = Object.assign(new Error('You exceeded your current quota; check your billing details'), { statusCode: 400, code: 'insufficient_quota' });
  const result = await generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-3.8-flash', async model => {
    calls.push(model);
    if (calls.length === 1) throw quotaError;
    return { text: 'Gemini answered' };
  }, provider => provider === 'google');
  assert.deepEqual(calls, ['openai/gpt-4o-mini', 'google/gemini-3.8-flash']);
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'Gemini answered');
});

test('recognizes nested provider status and quota codes', () => {
  assert.equal(isRetryableProviderFailure({ response: { status: 429 }, message: 'Too many requests' }), true);
  assert.equal(isRetryableProviderFailure({ code: 'insufficient_quota', message: 'Billing quota exhausted', status: 400 }), true);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('Malformed JSON request', 400)), false);
});

test('retries a transient Gemini 503 once, then returns the real successful response', async () => {
  const calls = [];
  const sleeps = [];
  const result = await generateWithExplicitFallback(
    'openai/gpt-4o-mini', 'google/gemini-3.8-flash',
    async model => {
      calls.push(model);
      if (model.startsWith('openai/')) throw new ModelProviderError('OpenAI quota exhausted', 429);
      if (calls.filter(item => item.startsWith('google/')).length === 1) throw new ModelProviderError('temporarily unavailable', 503);
      return { text: 'real generated response' };
    },
    provider => provider === 'google',
    { maxFallbackRetries: 1, sleep: async ms => { sleeps.push(ms); } },
  );
  assert.equal(result.result.text, 'real generated response');
  assert.equal(result.fallback_used, true);
  assert.deepEqual(calls, ['openai/gpt-4o-mini', 'google/gemini-3.8-flash', 'google/gemini-3.8-flash']);
  assert.equal(sleeps.length, 1);
});

test('stops after the bounded retry budget when Gemini continues returning 503', async () => {
  let calls = 0;
  await assert.rejects(
    generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-3.8-flash', async () => {
      calls++;
      throw new ModelProviderError('temporary service unavailable', 503);
    }, provider => provider === 'google', { maxFallbackRetries: 1, sleep: async () => {} }),
    error => error.statusCode === 503 && /retry shortly/i.test(error.message),
  );
  assert.equal(calls, 3); // one OpenAI attempt + two bounded Gemini attempts
});

test('does not retry Gemini auth, missing-model, or quota errors', async () => {
  for (const status of [401, 403, 404, 429]) {
    let calls = 0;
    await assert.rejects(generateWithExplicitFallback(
      'openai/gpt-4o-mini', 'google/gemini-3.8-flash', async () => {
        calls++;
        if (calls === 1) throw new ModelProviderError('OpenAI quota exhausted', 429);
        throw new ModelProviderError('provider failure', status);
      }, provider => provider === 'google', { maxFallbackRetries: 1, sleep: async () => {} }),
    );
    assert.equal(calls, 2, `Gemini HTTP ${status} should not be retried`);
  }
});

test('does not call Gemini when OpenAI succeeds', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback('openai/gpt-4o-mini', 'google/gemini-3.8-flash', async model => {
    calls.push(model);
    return { text: 'OpenAI response' };
  }, provider => provider === 'google');
  assert.deepEqual(calls, ['openai/gpt-4o-mini']);
  assert.equal(result.fallback_used, false);
});

test('does not wait for retry after request cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback(
    'openai/gpt-4o-mini', 'google/gemini-3.8-flash', async model => {
      calls++;
      if (model.startsWith('openai/')) throw new ModelProviderError('OpenAI quota exhausted', 429);
      throw new ModelProviderError('temporary service unavailable', 503);
    }, provider => provider === 'google', { signal: controller.signal, sleep: async () => {} }),
  );
  assert.equal(calls, 1); // request was cancelled before invoking Gemini
});
