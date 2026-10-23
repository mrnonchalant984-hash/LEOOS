import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelProviderError } from '../lib/ai/model-catalog.ts';
import { generateWithExplicitFallback, getSafeFallbackModel, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

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

test('falls back for provider authentication failures but not malformed requests', async () => {
  let calls = 0;
  const result = await generateWithExplicitFallback('openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest', async model => {
    calls++;
    if (model.startsWith('openai/')) throw new ModelProviderError('invalid API key', 401);
    return { text: 'fallback response' };
  }, () => true);
  assert.equal(result.fallback_used, true);
  assert.equal(calls, 2);
  assert.equal(isRetryableProviderFailure(new ModelProviderError('bad request', 400)), false);
});

test('does not retry when fallback is unavailable and retries network failures only once', async () => {
  let calls = 0;
  await assert.rejects(generateWithExplicitFallback('openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku-latest', async () => {
    calls++;
    throw new ModelProviderError('provider unavailable', 503);
  }, () => false), /fallback provider \(anthropic\) is unavailable/);
  assert.equal(calls, 0);
  const networkError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
  assert.equal(isRetryableProviderFailure(networkError), true);
});


test('treats missing provider models as retryable and uses Gemini for non-Google primaries when configured', async () => {
  assert.equal(isRetryableProviderFailure(new ModelProviderError('model not found', 404)), true);
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
  assert.deepEqual(calls, ['google/gemini-3.8-flash']);
  assert.equal(result.model, 'google/gemini-3.8-flash');
  assert.equal(result.fallback_used, true);
  assert.equal(result.result.text, 'Gemini answered');
});

test('uses OpenAI as a final fallback when Gemini itself is selected and OpenAI is configured', async () => {
  const calls = [];
  const fallbackModel = getSafeFallbackModel(
    'google/gemini-3.8-flash',
    undefined,
    false,
    provider => provider === 'google' || provider === 'openai',
  );
  const result = await generateWithExplicitFallback(
    'google/gemini-2.5-flash',
    fallbackModel,
    async model => {
      calls.push(model);
      if (model.startsWith('google/')) throw new ModelProviderError('Gemini unavailable', 503);
      return { text: 'OpenAI backup answered' };
    },
    provider => provider === 'google' || provider === 'openai',
  );
  assert.deepEqual(calls, ['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
  assert.equal(result.model, 'openai/gpt-4o-mini');
  assert.equal(result.fallback_used, true);
});

test('falls back to Gemini after primary provider authentication failure and does not expose error details in fallback logs', async () => {
  const calls = [];
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args.join(' '));
  try {
    const result = await generateWithExplicitFallback(
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
      async model => {
        calls.push(model);
        if (calls.length === 1) throw new ModelProviderError('invalid API key: do-not-log-this', 401);
        return { text: 'Gemini answered' };
      },
      () => true,
    );
    assert.equal(result.fallback_used, true);
    assert.deepEqual(calls, ['openai/gpt-4o-mini', 'google/gemini-3.8-flash']);
    assert.ok(logs.some(line => line.includes('leo.ai.fallback.start')));
    assert.ok(logs.some(line => line.includes('leo.ai.fallback.success')));
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
