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

test('a valid Gemini agent override is preserved and local model configuration cannot bypass Gemini-only routing', () => {
  const previous = {
    gemini: process.env.GEMINI_API_KEY,
    chat: process.env.LEO_CHAT_MODEL,
    localUrl: process.env.LEO_LOCAL_MODEL_URL,
    localName: process.env.LEO_LOCAL_MODEL_NAME,
  };
  try {
    process.env.GEMINI_API_KEY = 'configured';
    delete process.env.LEO_CHAT_MODEL;
    assert.equal(getAgentPrimaryModel('gemini-3.5-flash-lite', ''), 'google/gemini-3.5-flash-lite');
    process.env.LEO_LOCAL_MODEL_URL = 'http://127.0.0.1:11434/v1';
    process.env.LEO_LOCAL_MODEL_NAME = 'qwen-local';
    assert.equal(getAgentPrimaryModel('ignored'), 'google/gemini-3.8-flash');
  } finally {
    if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.gemini;
    if (previous.chat === undefined) delete process.env.LEO_CHAT_MODEL; else process.env.LEO_CHAT_MODEL = previous.chat;
    if (previous.localUrl === undefined) delete process.env.LEO_LOCAL_MODEL_URL; else process.env.LEO_LOCAL_MODEL_URL = previous.localUrl;
    if (previous.localName === undefined) delete process.env.LEO_LOCAL_MODEL_NAME; else process.env.LEO_LOCAL_MODEL_NAME = previous.localName;
  }
});
