import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serverSource = await readFile(new URL('../lib/mcp/server.ts', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../app/api/internal/agents/worker/route.ts', import.meta.url), 'utf8');
const mcpRouteSource = await readFile(new URL('../app/mcp/route.ts', import.meta.url), 'utf8');

test('external AI assist is explicitly client-driven and does not call a LeonardX model', () => {
  assert.match(serverSource, /registerTool\('leo_ai_external_assist'/);
  assert.match(serverSource, /inference_performed_by: 'connected_mcp_client'/);
  assert.match(serverSource, /leonardx_model_provider_called: false/);
  assert.match(serverSource, /registerTool\('leo_ai_external_assist_complete'/);
  assert.match(serverSource, /leoExternalAssistStart/);
  assert.match(serverSource, /leoExternalAssistComplete/);
  assert.match(mcpRouteSource, /External-AI conversation could not be persisted/);
  assert.match(mcpRouteSource, /chat\.user_id !== userId/);
  assert.match(serverSource, /save your final response with leo_ai_external_assist_complete/i);
});

test('agent worker no longer depends on AGENT_WORKER_ENABLED but remains protected by CRON_SECRET', () => {
  assert.doesNotMatch(workerSource, /AGENT_WORKER_ENABLED/);
  assert.match(workerSource, /process\.env\.CRON_SECRET/);
  assert.match(mcpRouteSource, /worker_enabled: true/);
  assert.doesNotMatch(mcpRouteSource, /AGENT_WORKER_ENABLED/);
});
