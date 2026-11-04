import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeFallbackModel } from '../lib/ai/provider-fallback.ts';
import {
  getDefaultTextModel,
  getModelProviderStatus,
  resolveModel,
} from '../lib/ai/model-catalog.ts';
import { getExternalModelBuilderAvailability } from '../lib/builders/providers.ts';

test('provider registry accepts Gemini models and rejects alternative model providers', () => {
  assert.deepEqual(resolveModel('google/gemini-2.5-flash'), { provider: 'google', model: 'gemini-2.5-flash' });
  assert.deepEqual(resolveModel('gemini-2.5-flash'), { provider: 'google', model: 'gemini-2.5-flash' });
  assert.deepEqual(resolveModel('gemini-3.8-flash'), { provider: 'google', model: 'gemini-3.8-flash' });
  assert.throws(() => resolveModel('openai/gpt-4o-mini'), /only Gemini/i);
  assert.throws(() => resolveModel('anthropic/claude-3-5-haiku-latest'), /only Gemini/i);
  assert.throws(() => resolveModel('local/qwen-local'), /only Gemini/i);
  assert.throws(() => resolveModel('gemini-2.0-flash'), /supported model/i);
});

test('five LEO model options resolve to distinct catalogued Google models', () => {
  const models = getModelProviderStatus();
  assert.deepEqual(models.map(({ model }) => model), [
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
  ]);
  assert.deepEqual(models.map(({ name }) => name), [
    'LEO Argon',
    'LEO Flash',
    'LEO Pro',
    'LEO Flash Lite',
    'LEO Classic Pro',
  ]);
  assert.equal(new Set(models.map(({ model }) => model)).size, 5);
  for (const model of models) {
    assert.deepEqual(resolveModel(model.id), { provider: 'google', model: model.model });
    assert.ok(model.capabilities.includes('text'));
  }
});

test('model registry rejects unknown and malformed caller-selected models', () => {
  assert.throws(() => resolveModel('not-a-model'), /supported model/i);
  assert.throws(() => resolveModel('openai/'), /supported model|only Gemini/i);
  assert.throws(() => resolveModel('anthropic/model with spaces'), /supported model|only Gemini/i);
});

test('unsupported configured default falls back to the single Gemini default when configured', () => {
  const previous = process.env.LEO_CHAT_MODEL;
  const previousGemini = process.env.GEMINI_API_KEY;
  try {
    process.env.LEO_CHAT_MODEL = 'provider-model-that-is-not-registered';
    process.env.GEMINI_API_KEY = 'test-key';
    assert.equal(getDefaultTextModel('chat'), 'google/gemini-3.8-flash');
  } finally {
    if (previous === undefined) delete process.env.LEO_CHAT_MODEL;
    else process.env.LEO_CHAT_MODEL = previous;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
  }
});

test('provider status advertises only Gemini and never returns configured secrets', () => {
  const status = getModelProviderStatus();
  assert.equal(status.length, 5);
  assert.ok(status.every(({ provider }) => provider === 'google'));
  assert.ok(status.every(({ configured }) => typeof configured === 'boolean'));
  assert.doesNotMatch(JSON.stringify(status), /sk-[A-Za-z0-9_-]{12,}|api.?key/i);
});

test('model defaults ignore local and alternative-provider configuration', () => {
  const names = ['LEO_LOCAL_MODEL_URL', 'LEO_LOCAL_MODEL_NAME', 'LEO_CHAT_MODEL', 'GEMINI_API_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.LEO_LOCAL_MODEL_URL = 'http://127.0.0.1:11434/v1';
    process.env.LEO_LOCAL_MODEL_NAME = 'qwen-local';
    process.env.GEMINI_API_KEY = 'test-key';
    assert.equal(getDefaultTextModel(), 'google/gemini-3.8-flash');
    process.env.LEO_CHAT_MODEL = 'google/gemini-2.5-flash';
    assert.equal(getDefaultTextModel(), 'google/gemini-2.5-flash');
    process.env.LEO_CHAT_MODEL = 'openai/gpt-4o-mini';
    assert.equal(getDefaultTextModel(), 'google/gemini-3.8-flash');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('external-model deployments require GitHub and Vercel but not a LeonardX AI key', () => {
  assert.deepEqual(
    getExternalModelBuilderAvailability('website', { GITHUB_TOKEN: 'configured', VERCEL_TOKEN: 'configured' }),
    {
      id: 'vercel-nextjs',
      label: 'Next.js on GitHub and Vercel',
      requiredEnvironment: ['GITHUB_TOKEN', 'VERCEL_TOKEN'],
      status: 'ready',
    },
  );
  const missing = getExternalModelBuilderAvailability('website', { GITHUB_TOKEN: 'configured' });
  assert.equal(missing.status, 'not_configured');
  assert.deepEqual(missing.requiredEnvironment, ['GITHUB_TOKEN', 'VERCEL_TOKEN']);
});


test('invalid explicit fallback configuration safely uses configured Gemini for OpenAI chat', () => {
  const configured = provider => provider === 'google' || provider === 'openai';
  assert.equal(
    getSafeFallbackModel('google/gemini-3.8-flash', 'unsupported/fallback-model', false, configured),
    'google/gemini-2.5-flash',
  );
});

test('valid explicit fallback is normalized and requires a configured provider', () => {
  const configured = provider => provider === 'google';
  assert.equal(
    getSafeFallbackModel('google/gemini-3.8-flash', 'gemini-2.5-flash', false, configured),
    'google/gemini-2.5-flash',
  );
  assert.equal(
    getSafeFallbackModel('google/gemini-3.8-flash', 'anthropic/claude-3-5-haiku-latest', false, configured),
    'google/gemini-2.5-flash',
  );
});

test('Gemini is the only automatic fallback, including for a Gemini primary', () => {
  const configured = provider => provider === 'google';
  assert.equal(getSafeFallbackModel('google/gemini-3.8-flash', 'bad/model', true, configured), 'google/gemini-2.5-flash');
  assert.equal(getSafeFallbackModel('google/gemini-2.5-flash', 'bad/model', false, configured), 'google/gemini-3.8-flash');
  assert.equal(getSafeFallbackModel('google/gemini-3.8-flash', undefined, false, configured), 'google/gemini-2.5-flash');
});

test('OpenAI credentials alone do not enable a model provider', () => {
  const names = ['LEO_LOCAL_MODEL_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'LEO_CHAT_MODEL', 'LEO_REASONING_MODEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousOpenAi = process.env.OPENAI_API_KEY;
  try {
    for (const name of names) delete process.env[name];
    process.env.OPENAI_API_KEY = 'configured';
    assert.throws(() => getDefaultTextModel(), /Gemini is not configured/i);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAi;
  }
});

test('whitespace-only Google credentials are treated as unconfigured', () => {
  const oldGeminiKey = process.env.GEMINI_API_KEY;
  const oldGoogleKey = process.env.GOOGLE_API_KEY;
  try {
    process.env.GEMINI_API_KEY = '  ';
    process.env.GOOGLE_API_KEY = '\t';
    assert.equal(getModelProviderStatus().find(item => item.provider === 'google')?.configured, false);
  } finally {
    if (oldGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGeminiKey;
    if (oldGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = oldGoogleKey;
  }
});

test('central execution registry contains no direct alternative-provider SDK path', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../lib/ai/provider-registry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]openai['"]|from ['"]@anthropic-ai\/sdk['"]|getOpenAI\(|getTextOpenAI\(/);
  assert.doesNotMatch(source, /client\.chat\.completions|client\.responses\.create|client\.messages\.create/);
  assert.match(source, /Only Gemini model execution is enabled/);
  const legacyAdapter = await readFile(new URL('../lib/leo-system-prompt.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(legacyAdapter, /from ['\"]openai['\"]|new OpenAI|chat\.completions|responses\.create/);
});

test('legacy local-model and realtime endpoints fail closed instead of executing alternate providers', async () => {
  const { readFile } = await import('node:fs/promises');
  const localRoute = await readFile(new URL('../app/api/offline/chat/route.ts', import.meta.url), 'utf8');
  const realtimeRoute = await readFile(new URL('../app/api/realtime/session/route.ts', import.meta.url), 'utf8');
  const meetingRealtimeRoute = await readFile(new URL('../app/api/meetings/[id]/realtime-session/route.ts', import.meta.url), 'utf8');
  assert.match(localRoute, /LOCAL_MODEL_DISABLED/);
  assert.doesNotMatch(localRoute, /createTextResponse|LEO_LOCAL_MODEL_URL/);
  assert.match(realtimeRoute, /GEMINI_AUDIO_WORKFLOW_NOT_VERIFIED/);
  assert.doesNotMatch(realtimeRoute, /getOpenAI|clientSecrets\.create|api\.openai\.com/);
  assert.match(meetingRealtimeRoute, /GEMINI_AUDIO_WORKFLOW_NOT_VERIFIED/);
  assert.doesNotMatch(meetingRealtimeRoute, /getOpenAI|clientSecrets\.create|api\.openai\.com/);
});
