import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const route = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const envCatalog = await readFile(new URL('../lib/env-config-catalog.ts', import.meta.url), 'utf8');
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
  assert.match(fallback, /google\/gemini-3\.8-flash/);
  assert.match(fallback, /if \(customAgent\) return undefined/);
});

test('Gemini provider forwards system instructions and maps assistant history to model turns', () => {
  assert.match(provider, /systemInstruction: system/);
  assert.match(provider, /message\.role === 'assistant' \? 'model' : 'user'/);
  assert.match(provider, /GEMINI_API_KEY \|\| process\.env\.GOOGLE_API_KEY/);
});

test('Gemini API key and fallback configuration are server-side environment variables', () => {
  assert.match(envCatalog, /name: 'GEMINI_API_KEY'/);
  assert.match(route, /process\.env\.LEO_FALLBACK_MODEL/);
  assert.doesNotMatch(envCatalog, /NEXT_PUBLIC_GEMINI_API_KEY/);
});
