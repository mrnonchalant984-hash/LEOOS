import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleUserMcpRequest } from '../lib/mcp/server.ts';

const project = {
  id: 'fb3f9f0d-a96f-4d05-b95f-00683d3ba75d',
  project_name: 'Private test project',
  type: 'web_app',
  status: 'draft',
  progress: 0,
  created_at: '2026-10-15T00:00:00.000Z',
};

function createReader() {
  return {
    async listProjects(userId, limit) {
      assert.equal(userId, 'authenticated-user');
      assert.equal(limit, 10);
      return { data: [project], error: null };
    },
    async getProject(userId, projectId) {
      assert.equal(userId, 'authenticated-user');
      return { data: projectId === project.id ? project : null, error: null };
    },
  };
}

test('Streamable HTTP MCP server initializes, lists tools, and calls a harmless read-only tool', async () => {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', createReader()),
  });
  const client = new Client({ name: 'leonardx-protocol-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_project_status', 'list_projects']);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));

    const result = await client.callTool({ name: 'list_projects', arguments: { limit: 10 } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), [project]);
  } finally {
    await client.close();
  }
});

test('MCP project status lookup returns only the authenticated user-owned project', async () => {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', createReader()),
  });
  const client = new Client({ name: 'leonardx-protocol-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'get_project_status', arguments: { project_id: project.id } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), project);
  } finally {
    await client.close();
  }
});
