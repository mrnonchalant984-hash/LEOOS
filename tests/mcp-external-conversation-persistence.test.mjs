import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/mcp/route.ts', import.meta.url), 'utf8');
const server = await readFile(new URL('../lib/mcp/server.ts', import.meta.url), 'utf8');

test('external assist stores client messages and response in owner-scoped chats_v2 history', () => {
  assert.match(route, /async leoExternalAssistStart/);
  assert.match(route, /async leoExternalAssistComplete/);
  assert.match(route, /from\('chats_v2'\).*select\('id,user_id,title,messages'\)/s);
  assert.match(route, /\.eq\('id', sessionId\)\.eq\('user_id', userId\)/);
  assert.match(route, /\.eq\('id', input\.session_id\)\.eq\('user_id', userId\)/);
  assert.match(route, /insert\(\{ id: sessionId, user_id: userId, title: input\.message/);
  assert.match(route, /if \(!chat \|\| chat\.user_id !== userId\) return \{ data: null, error: 'Conversation not found\.' \}/);
  assert.match(route, /role: 'assistant', content: input\.assistant_response/);
  assert.match(server, /leo_ai_external_assist_complete/);
  assert.match(server, /confirm: z\.literal\(true\).*saving this message to conversation history/);
  assert.match(server, /confirm: z\.literal\(true\).*saving this response to conversation history/);
});

test('external assist does not claim to verify which external model produced the supplied answer', () => {
  assert.match(server, /does not verify which model generated it/);
  assert.match(route, /inference_provider: 'connected_mcp_client_claim_not_independently_verified'/);
});
