import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Leo AI MCP uses the real provider router, owner-scoped chats, and idempotent request records', async () => {
  const route = await source('app/mcp/route.ts');
  const server = await source('lib/mcp/server.ts');
  const migration = await source('supabase/migrations/20261019150000_mcp_gateway_execution.sql');
  assert.match(route, /generateText\(/);
  assert.match(route, /getLeoSystemPrompt\(\)/);
  assert.match(route, /from\('chats_v2'\)/);
  assert.match(route, /existingChat\.user_id !== userId/);
  assert.match(route, /\.eq\('user_id', userId\)/);
  assert.match(route, /getProjectFiles\(userId, input\.project_id\)/);
  assert.match(route, /mcp_ai_requests/);
  assert.match(migration, /unique\(user_id, idempotency_key\)/);
  assert.match(server, /leo_ai_chat/);
  assert.match(server, /confirm: z\.literal\(true\)/);
});

test('MCP agent execution rechecks entitlements and account ownership', async () => {
  const route = await source('app/mcp/route.ts');
  const worker = await source('app/api/internal/agents/worker/route.ts');
  assert.match(route, /canUseManualAgents\(plan\.key, platformOwner\)/);
  assert.match(route, /agentAllowed\(staticAgent\.id, plan\.key, platformOwner\)/);
  assert.match(route, /\.eq\('user_id', userId\)/);
  assert.match(worker, /canUseManualAgents\(plan\.key, owner\)/);
  assert.match(worker, /agentAllowed\(agent\.id, plan\.key, owner\)/);
  assert.match(worker, /claim_agent_jobs/);
  assert.match(route, /mcp_direct_execution/);
  assert.match(route, /const result = await runAgent\(staticAgent/);
  assert.match(route, /Agent finished but its result could not be persisted/);
});

test('owner-created agents use only the no-tools text adapter and remain owner-only', async () => {
  const route = await source('app/mcp/route.ts');
  const server = await source('lib/mcp/server.ts');
  assert.match(route, /config\.execution !== 'mcp_text_only'/);
  assert.match(route, /enabled: false, owner_only: true, allowed_tools: \[\]/);
  assert.match(route, /if \(!platformOwner\) return \{ data: null, error: 'Platform owner access is required\.'/);
  assert.match(route, /You have no tools, credentials, filesystem access, database permissions, or deployment privileges/);
  assert.match(server, /if \(projects\.isPlatformOwner\)/);
});

test('agent cancellation is limited to queued owner runs and atomically races worker claims', async () => {
  const migration = await source('supabase/migrations/20261019150000_mcp_gateway_execution.sql');
  const route = await source('app/mcp/route.ts');
  assert.match(migration, /cancel_queued_agent_run/);
  assert.match(migration, /run_status is distinct from 'queued'/i);
  assert.match(migration, /job_status is distinct from 'queued'/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /grant execute on function public\.cancel_queued_agent_run\(uuid,uuid\) to service_role/);
  assert.match(route, /p_user_id: userId/);
});