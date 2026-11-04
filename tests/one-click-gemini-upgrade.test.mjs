import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultTextModel, getModelProviderStatus, resolveModel } from '../lib/ai/model-catalog.ts';
import { getSafeFallbackModel } from '../lib/ai/provider-fallback.ts';

test('model registry accepts supported Gemini models and rejects other providers', () => {
  assert.deepEqual(resolveModel('google/gemini-3.8-flash'), { provider: 'google', model: 'gemini-3.8-flash' });
  assert.deepEqual(resolveModel('gemini-2.5-flash'), { provider: 'google', model: 'gemini-2.5-flash' });
  assert.throws(() => resolveModel('openai/gpt-4o-mini'), /only Gemini/i);
  assert.throws(() => resolveModel('anthropic/claude-3-5-haiku-latest'), /only Gemini/i);
  assert.throws(() => resolveModel('gemini-2.0-flash'), /supported model/i);
});

test('unsupported configured default falls back only to configured Gemini', () => {
  const names = ['LEO_CHAT_MODEL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.LEO_CHAT_MODEL = 'provider-model-that-is-not-registered';
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GOOGLE_API_KEY;
    assert.equal(getDefaultTextModel('chat'), 'google/gemini-3.8-flash');
  } finally {
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
  }
});

test('provider status advertises only Gemini without exposing credentials', () => {
  const status = getModelProviderStatus();
  assert.equal(status.length, 6);
  assert.ok(status.every(({ provider }) => provider === 'google'));
  assert.ok(status.every(({ configured }) => typeof configured === 'boolean'));
  assert.doesNotMatch(JSON.stringify(status), /sk-[A-Za-z0-9_-]{12,}|api.?key/i);
});

test('model defaults ignore local and alternative-provider settings', () => {
  const names = ['LEO_LOCAL_MODEL_URL', 'LEO_LOCAL_MODEL_NAME', 'LEO_CHAT_MODEL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.LEO_LOCAL_MODEL_URL = 'http://127.0.0.1:11434/v1';
    process.env.LEO_LOCAL_MODEL_NAME = 'qwen-local';
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GOOGLE_API_KEY;
    assert.equal(getDefaultTextModel(), 'google/gemini-3.8-flash');
    process.env.LEO_CHAT_MODEL = 'google/gemini-2.5-flash';
    assert.equal(getDefaultTextModel(), 'google/gemini-2.5-flash');
    process.env.LEO_CHAT_MODEL = 'openai/gpt-4o-mini';
    assert.equal(getDefaultTextModel(), 'google/gemini-3.8-flash');
  } finally {
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
  }
});

test('Gemini fallback selection never invokes non-Gemini providers', () => {
  const configured = provider => provider === 'google';
  assert.equal(getSafeFallbackModel('google/gemini-3.8-flash', 'unsupported/fallback-model', false, configured), 'google/gemini-3.1-flash-lite');
  assert.equal(getSafeFallbackModel('google/gemini-3.8-flash', 'gemini-2.5-flash', false, configured), 'google/gemini-3.1-flash-lite');
  assert.equal(getSafeFallbackModel('google/gemini-2.5-flash', undefined, false, configured), 'google/gemini-3.8-flash');
});
