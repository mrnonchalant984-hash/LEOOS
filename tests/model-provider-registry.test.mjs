import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultTextModel,
  getModelProviderStatus,
  resolveModel,
} from '../lib/ai/model-catalog.ts';
import { getExternalModelBuilderAvailability } from '../lib/builders/providers.ts';

test('provider registry resolves its supported named models to concrete providers', () => {
  assert.deepEqual(resolveModel('openai/gpt-4o-mini'), { provider: 'openai', model: 'gpt-4o-mini' });
  assert.deepEqual(resolveModel('openai/gpt-5.6-luna'), { provider: 'openai', model: 'gpt-5.6-luna' });
  assert.deepEqual(resolveModel('anthropic/claude-3-5-haiku-latest'), { provider: 'anthropic', model: 'claude-3-5-haiku-latest' });
  assert.deepEqual(resolveModel('google/gemini-2.5-flash'), { provider: 'google', model: 'gemini-2.5-flash' });
});

test('model registry rejects unknown and malformed caller-selected models', () => {
  assert.throws(() => resolveModel('not-a-model'), /supported model/i);
  assert.throws(() => resolveModel('openai/'), /supported model/i);
  assert.throws(() => resolveModel('anthropic/model with spaces'), /supported model/i);
});

test('provider status reveals availability without returning configured secrets', () => {
  const status = getModelProviderStatus();
  assert.deepEqual(status.map(({ provider }) => provider), ['openai', 'openai', 'anthropic', 'google']);
  assert.ok(status.every(({ configured }) => typeof configured === 'boolean'));
  assert.doesNotMatch(JSON.stringify(status), /sk-[A-Za-z0-9_-]{12,}|api.?key/i);
});

test('model defaults preserve local-model preference and support an explicit cross-provider default', () => {
  const oldLocalUrl = process.env.LEO_LOCAL_MODEL_URL;
  const oldLocalName = process.env.LEO_LOCAL_MODEL_NAME;
  const oldChatModel = process.env.LEO_CHAT_MODEL;
  try {
    process.env.LEO_LOCAL_MODEL_URL = 'http://127.0.0.1:11434/v1';
    process.env.LEO_LOCAL_MODEL_NAME = 'qwen-local';
    assert.equal(getDefaultTextModel(), 'local/qwen-local');
    delete process.env.LEO_LOCAL_MODEL_URL;
    delete process.env.LEO_LOCAL_MODEL_NAME;
    process.env.LEO_CHAT_MODEL = 'google/gemini-2.5-flash';
    assert.equal(getDefaultTextModel(), 'google/gemini-2.5-flash');
  } finally {
    if (oldLocalUrl === undefined) delete process.env.LEO_LOCAL_MODEL_URL;
    else process.env.LEO_LOCAL_MODEL_URL = oldLocalUrl;
    if (oldLocalName === undefined) delete process.env.LEO_LOCAL_MODEL_NAME;
    else process.env.LEO_LOCAL_MODEL_NAME = oldLocalName;
    if (oldChatModel === undefined) delete process.env.LEO_CHAT_MODEL;
    else process.env.LEO_CHAT_MODEL = oldChatModel;
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
