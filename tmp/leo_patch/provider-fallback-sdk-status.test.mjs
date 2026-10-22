import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWithExplicitFallback, isRetryableProviderFailure } from '../lib/ai/provider-fallback.ts';

test('falls back when a provider SDK reports statusCode rather than status', async () => {
  const calls = [];
  const result = await generateWithExplicitFallback(
    'openai/gpt-4o-mini', 'google/gemini-2.5-flash', async model => {
      calls.push(model);
      if (calls.length === 1) throw Object.assign(new Error('upstream temporarily unavailable'), { statusCode: 503 });
      return { text: 'Gemini fallback succeeded' };
    }, () => true,
  );
  assert.deepEqual(calls, ['openai/gpt-4o-mini', 'google/gemini-2.5-flash']);
  assert.equal(result.fallback_used, true);
  assert.equal(result.model, 'google/gemini-2.5-flash');
  assert.equal(result.result.text, 'Gemini fallback succeeded');
});

test('recognizes wrapped provider response status and still avoids auth fallback', () => {
  assert.equal(isRetryableProviderFailure({ message: 'gateway failed', response: { status: 502 } }), true);
  assert.equal(isRetryableProviderFailure({ message: 'unauthorized', statusCode: 401 }), false);
  assert.equal(isRetryableProviderFailure({ message: 'bad request', cause: { status: 400 } }), false);
});
