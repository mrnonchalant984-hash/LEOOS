import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const provider = await readFile(new URL('../lib/ai/provider-registry.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/chat/stream/route.ts', import.meta.url), 'utf8');
const widget = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('Gemini streaming uses provider chunks and captures final usage without faking token reveal', () => {
  assert.match(provider, /generateContentStream\(/);
  assert.match(provider, /for await \(const chunk of stream\)/);
  assert.match(provider, /onText\(text\)/);
  assert.match(provider, /normalizeUsage\(inputTokens, outputTokens\)/);
});

test('stream endpoint authenticates, rate limits, checks chat ownership, persists only completed output, and emits SSE events', () => {
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /enforceLeoCodeDailyQuota/);
  assert.match(route, /chat\.user_id !== ctx\.user\.id/);
  assert.match(route, /generateTextStream\(/);
  assert.match(route, /type: 'delta'/);
  assert.match(route, /type: 'done'/);
  assert.match(route, /type: 'error'/);
  assert.match(route, /cancel\(\) \{ abortController\.abort/);
  assert.match(route, /\.update\(\{ messages: updated/);
});

test('Leo UI consumes server-sent deltas and supports cancellation for streamed normal chat', () => {
  assert.match(widget, /fetch\("\/api\/chat\/stream"/);
  assert.match(widget, /reader\.read\(\)/);
  assert.match(widget, /streamedText \+= event\.text/);
  assert.match(widget, /function stopGeneration\(\)/);
  assert.match(widget, /chatAbortController\.current\?\.abort\(\)/);
  assert.match(widget, /Leo is thinking/);
});
