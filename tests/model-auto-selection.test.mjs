import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultTextModel, getModelProviderStatus } from '../lib/ai/model-catalog.ts';

const names = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'LEO_API_KEY', 'ANTHROPIC_API_KEY', 'LEO_LOCAL_MODEL_URL', 'LEO_CHAT_MODEL', 'LEO_REASONING_MODEL'];

test('Auto chooses the configured Gemini model', () => {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.GEMINI_API_KEY = 'configured';
    assert.equal(getDefaultTextModel('chat'), 'google/gemini-3.8-flash');
    assert.equal(getModelProviderStatus().find(item => item.provider === 'google')?.configured, true);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Auto reports no configured model instead of defaulting to Google', () => {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.OPENAI_API_KEY = 'configured';
    assert.throws(() => getDefaultTextModel('chat'), /Gemini is not configured/i);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
