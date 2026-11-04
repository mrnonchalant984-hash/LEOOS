import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMcpToolArguments } from '../lib/mcp/tool-arguments.ts';
import { mcpToolsNeedingReapproval } from '../lib/mcp/tool-diff.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('remote MCP arguments are checked against the discovered JSON Schema without coercion', () => {
  const schema = {
    type: 'object',
    properties: { query: { type: 'string', minLength: 2 } },
    required: ['query'],
    additionalProperties: false,
  };
  assert.equal(validateMcpToolArguments(schema, { query: 'ok' }), true);
  assert.equal(validateMcpToolArguments(schema, { query: 'x' }), false);
  assert.equal(validateMcpToolArguments(schema, { query: 42 }), false);
  assert.equal(validateMcpToolArguments(schema, { query: 'ok', extra: true }), false);
  assert.equal(validateMcpToolArguments(schema, {}), false);
});

test('remote tool changes invalidate approval while unchanged schemas remain approved', () => {
  const oldTools = [
    { name: 'lookup', description: 'Read data', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
    { name: 'removed', description: 'Removed later', inputSchema: { type: 'object' } },
  ];
  const updatedTools = [
    { inputSchema: { properties: { id: { type: 'string' } }, type: 'object' }, description: 'Read data', name: 'lookup' },
    { name: 'added', description: 'New tool', inputSchema: { type: 'object' } },
  ];
  assert.deepEqual(mcpToolsNeedingReapproval(oldTools, updatedTools), ['removed']);
  updatedTools[0].description = 'Now performs a different operation';
  assert.deepEqual(mcpToolsNeedingReapproval(oldTools, updatedTools), ['lookup', 'removed']);
});

test('MCP connections rediscover tools, revoke stale approvals, and support legacy SSE safely', () => {
  const client = read('lib/mcp/remote-clients.ts');
  const outbound = read('lib/mcp/outbound-security.ts');
  const refresh = read('app/api/mcp/servers/[id]/refresh/route.ts');
  const manager = read('components/McpConnectionManager.tsx');
  assert.match(client, /SSEClientTransport/);
  assert.match(client, /connectRemoteClient/);
  assert.match(client, /validateMcpToolArguments/);
  assert.match(outbound, /allowSameOriginPaths = false/);
  assert.match(outbound, /target\.origin !== approvedEndpoint\.origin/);
  assert.match(refresh, /mcpToolsNeedingReapproval/);
  assert.match(refresh, /\.delete\(\)/);
  assert.match(manager, /\/refresh/);
});

test('manual MCP execution rejects arguments that do not match the discovered schema', () => {
  const route = read('app/api/mcp/servers/[id]/call/route.ts');
  const orchestrator = read('lib/ai/tool-orchestrator.ts');
  assert.match(route, /validateMcpToolArguments\(tool\.inputSchema, args\)/);
  assert.match(orchestrator, /validateMcpToolArguments\(remoteTool\.inputSchema, args\)/);
});
