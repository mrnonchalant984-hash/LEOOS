import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAgentPrimaryModel } from '../lib/ai/agent-model-selection.ts';

test('built-in agents use the validated Gemini default when no agent override is set', () => {
  const previous = { gemini: process.env.GEMINI_API_KEY, chat: process.env.LEO_CHAT_MODEL, agent: process.env.LEO_AGENT_MODEL, local: process.env.LEO_LOCAL_MODEL_URL };
  try {
    process.env.GEMINI_API_KEY = 'configured';
    delete process.env.LEO_CHAT_MODEL;
    delete process.env.LEO_AGENT_MODEL;
    delete process.env.LEO_LOCAL_MODEL_URL;
    assert.equal(getAgentPrimaryModel(undefined), 'google/gemini-3.8-flash');
  } finally {
    for (const [key, name] of [['gemini', 'GEMINI_API_KEY'], ['chat', 'LEO_CHAT_MODEL'], ['agent', 'LEO_AGENT_MODEL'], ['local', 'LEO_LOCAL_MODEL_URL']]) {
      if (previous[key] === undefined) delete process.env[name]; else process.env[name] = previous[key];
    }
  }
});

test('invalid or non-Gemini agent overrides do not bypass Gemini-first routing', () => {
  const previous = { gemini: process.env.GEMINI_API_KEY, chat: process.env.LEO_CHAT_MODEL };
  try {
    process.env.GEMINI_API_KEY = 'configured';
    delete process.env.LEO_CHAT_MODEL;
    assert.equal(getAgentPrimaryModel('not-a-real-model'), 'google/gemini-3.8-flash');
    assert.equal(getAgentPrimaryModel('openai/gpt-4o-mini'), 'google/gemini-3.8-flash');
  } finally {
    if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.gemini;
    if (previous.chat === undefined) delete process.env.LEO_CHAT_MODEL; else process.env.LEO_CHAT_MODEL = previous.chat;
  }
});

test('a valid Gemini agent override and explicit local model configuration are preserved', () => {
  const previous = { gemini: process.env.GEMINI_API_KEY };
  try {
    process.env.GEMINI_API_KEY = 'configured';
    assert.equal(getAgentPrimaryModel('gemini-3.5-flash-lite', ''), 'google/gemini-3.5-flash-lite');
    assert.equal(getAgentPrimaryModel('ignored', 'http://127.0.0.1:11434/v1', 'qwen-local'), 'local/qwen-local');
  } finally {
    if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.gemini;
  }
});
