import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  agentHasMcpReadCapability,
  mcpToolGrantedToAgent,
} from '../lib/agents/mcp-capabilities.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('only agents with an explicit read capability can receive MCP tool grants', () => {
  assert.equal(agentHasMcpReadCapability({ allowedTools: ['email_read'] }), true);
  assert.equal(agentHasMcpReadCapability({ allowedTools: ['database_read'] }), true);
  assert.equal(agentHasMcpReadCapability({ allowedTools: ['repository_read'] }), true);
  assert.equal(agentHasMcpReadCapability({ allowedTools: ['file_read'] }), false);
  assert.equal(mcpToolGrantedToAgent(['email', 'database'], 'email'), true);
  assert.equal(mcpToolGrantedToAgent(['database'], 'email'), false);
  assert.equal(mcpToolGrantedToAgent(null, 'email'), false);
});

test('MCP specialist grants are validated, applied at discovery, and rechecked before execution', async () => {
  const toolRoute = await read('app/api/mcp/servers/[id]/tools/route.ts');
  const orchestrator = await read('lib/ai/tool-orchestrator.ts');
  const manager = await read('lib/agents/manager.ts');
  const provider = await read('lib/ai/provider-registry.ts');
  const mcpClient = await read('lib/mcp/remote-clients.ts');
  assert.match(toolRoute, /agent_ids/);
  assert.match(toolRoute, /agentHasMcpReadCapability/);
  assert.match(toolRoute, /allowed_agent_ids: agentIds/);
  assert.match(orchestrator, /agentPolicy\.allowMcpRead/);
  assert.match(orchestrator, /mcpToolGrantedToAgent\(approval\?\.allowed_agent_ids, agentPolicy\.agentId\)/);
  assert.match(orchestrator, /This MCP tool is no longer granted to the running specialist/);
  assert.match(manager, /agentId: agent\.id/);
  assert.match(manager, /allowMcpRead: agentHasMcpReadCapability\(agent\)/);
  assert.match(manager, /AbortSignal\.timeout\(agent\.timeoutMs\)/);
  assert.match(manager, /agent\.maxRetries > 0/);
  assert.match(provider, /abortSignal: request\.signal/);
  assert.match(provider, /Agent execution timed out or was cancelled/);
  assert.match(mcpClient, /signal \? \{ signal \} : undefined/);
});

test('MCP connection UI exposes specialist grants and migration defaults old approvals to none', async () => {
  const route = await read('app/api/mcp/servers/route.ts');
  const component = await read('components/McpConnectionManager.tsx');
  const migration = await read('supabase/migrations/20261110100000_agent_scoped_mcp_tool_grants.sql');
  assert.match(route, /agent_options: agentOptions/);
  assert.match(component, /Grant to specialist agents/);
  assert.match(component, /agent_ids: nextIds/);
  assert.match(migration, /allowed_agent_ids text\[\] not null default '\{\}'::text\[\]/);
  assert.match(migration, /cardinality\(allowed_agent_ids\) <= 20/);
});
