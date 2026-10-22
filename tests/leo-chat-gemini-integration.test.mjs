import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const route = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const provider = await readFile(new URL('../lib/ai/provider-registry.ts', import.meta.url), 'utf8');
const fallback = await readFile(new URL('../lib/ai/provider-fallback.ts', import.meta.url), 'utf8');

test('Leo chat sends its server-generated system prompt and bounded conversation history to the selected provider', () => {
  assert.match(route, /getLeoSystemPrompt\(\)/);
  assert.match(route, /history\.slice\(-20\)/);
  assert.match(route, /generateText\(\{ \.\.\.request, model \}\)/);
});

test('Leo chat wires transient provider fallback and defaults to Gemini when configured for OpenAI primary', () => {
  assert.match(route, /generateWithExplicitFallback/);
  assert.match(route, /getSafeFallbackModel/);
  assert.match(fallback, /primary\.provider !== 'google' && configured\('google'\)/);
  assert.match(fallback, /google\/gemini-2\.5-flash/);
  assert.doesNotMatch(route, /getSafeFallbackModel\([^;]*Boolean\(customAgent\)/);
});

test('Gemini provider forwards system instructions and maps assistant history to model turns', () => {
  assert.match(provider, /systemInstruction: system/);
  assert.match(provider, /message\.role === 'assistant' \? 'model' : 'user'/);
  assert.match(provider, /GEMINI_API_KEY \|\| process\.env\.GOOGLE_API_KEY/);
});

test('Gemini API key and fallback configuration are server-side environment variables', () => {
  assert.match(envExample, /^GEMINI_API_KEY=$/m);
  assert.match(envExample, /^LEO_FALLBACK_MODEL=$/m);
  assert.doesNotMatch(envExample, /^NEXT_PUBLIC_GEMINI_API_KEY=/m);
});
