import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleUserMcpRequest } from '../lib/mcp/server.ts';
import { MCP_DEFAULT_SCOPE, MCP_READ_SCOPE, MCP_WRITE_SCOPE, parseMcpScopes, parseRequestedMcpScopes } from '../lib/mcp/scopes.ts';

const project = {
  id: 'fb3f9f0d-a96f-4d05-b95f-00683d3ba75d',
  project_name: 'Private test project',
  type: 'web_app',
  status: 'draft',
  progress: 0,
  created_at: '2026-10-15T00:00:00.000Z',
};

function createReader(overrides = {}) {
  return {
    async getAccountPlan() {
      return { data: { plan: 'free', projects: { used: 1, limit: 1 } }, error: null };
    },
    async listProjects(userId, limit) {
      assert.equal(userId, 'authenticated-user');
      assert.equal(limit, 10);
      return { data: [project], error: null };
    },
    async getProject(userId, projectId) {
      assert.equal(userId, 'authenticated-user');
      return { data: projectId === project.id ? project : null, error: null };
    },
    async getHostingStatus(userId, projectId) {
      assert.equal(userId, 'authenticated-user');
      return { data: projectId === project.id ? { trial_started: true, days_remaining: 90 } : null, error: null };
    },
    async createProject() { return { data: null, error: null }; },
    async renameProject() { return { data: null, error: null }; },
    async saveProjectFiles() { return { data: null, error: null }; },
    async buildAndDeploy() { return { data: null, error: null }; },
    async getConfigurationStatus() {
      return { data: { target: 'production', variables: [], missingRequired: [], note: 'Secret values are never returned by MCP tools.' }, error: null };
    },
    async getEngineeringWorkflowStatus() {
      return { data: { workflows: [] }, error: null };
    },
    async getCapabilityAlternatives() {
      return { data: { budget: 'free', requirements: [] }, error: null };
    },
    async planEngineeringWorkflow(_userId, input) {
      return { data: { orderedStages: ['REQUEST_RECEIVED'], projectType: input.projectType }, error: null };
    },
    async createEngineeringWorkflow() { return { data: { id: 'workflow' }, error: null }; },
    async advanceEngineeringWorkflow() { return { data: { status: 'RUNNING' }, error: null }; },
    async cancelEngineeringWorkflow() { return { data: { status: 'CANCELLED' }, error: null }; },
    ...overrides,
  };
}

test('Streamable HTTP MCP server initializes, lists tools, and calls a harmless read-only tool', async () => {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE], createReader()),
  });
  const client = new Client({ name: 'leonardx-protocol-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), [
      'get_account_plan',
      'get_capability_alternatives',
      'get_cloud_build_status',
      'get_configuration_status',
      'get_engineering_workflow_status',
      'get_project_hosting_status',
      'get_project_status',
      'list_projects',
      'plan_engineering_workflow',
      'read_project_files',
    ]);
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
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], createReader()),
  });
  const client = new Client({ name: 'leonardx-protocol-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'get_project_status', arguments: { project_id: project.id } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), project);
    const hosting = await client.callTool({ name: 'get_project_hosting_status', arguments: { project_id: project.id } });
    assert.equal(hosting.isError, undefined);
    assert.deepEqual(JSON.parse(hosting.content[0].text), { trial_started: true, days_remaining: 90 });
  } finally {
    await client.close();
  }
});

test('MCP write tools require the write scope and explicit confirmation input', async () => {
  const readTransport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE], createReader()),
  });
  const readClient = new Client({ name: 'read-only-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await readClient.connect(readTransport);
    const { tools } = await readClient.listTools();
    assert.equal(tools.some(tool => tool.name === 'create_project'), false);
    assert.equal(tools.some(tool => tool.name === 'save_project_files'), false);
    assert.equal(tools.some(tool => tool.name === 'build_and_deploy_project'), false);
    assert.equal(tools.some(tool => tool.name === 'start_cloud_build'), false);
  } finally {
    await readClient.close();
  }

  const writeTransport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], createReader()),
  });
  const writeClient = new Client({ name: 'write-scoped-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await writeClient.connect(writeTransport);
    const { tools } = await writeClient.listTools();
    const create = tools.find(tool => tool.name === 'create_project');
    const deploy = tools.find(tool => tool.name === 'build_and_deploy_project');
    const cloudBuild = tools.find(tool => tool.name === 'start_cloud_build');
    assert.deepEqual(tools.map(tool => tool.name).sort(), [
      'advance_engineering_workflow',
      'build_and_deploy_project',
      'cancel_engineering_workflow',
      'create_engineering_workflow',
      'create_project',
      'get_account_plan',
      'get_capability_alternatives',
      'get_cloud_build_status',
      'get_configuration_status',
      'get_engineering_workflow_status',
      'get_project_hosting_status',
      'get_project_status',
      'list_projects',
      'plan_engineering_workflow',
      'read_project_files',
      'rename_project',
      'save_project_files',
      'start_cloud_build',
    ]);
    assert.ok(create);
    assert.ok(deploy);
    assert.ok(cloudBuild);
    assert.equal(create.inputSchema.properties.confirm.const, true);
    assert.equal(deploy.annotations?.destructiveHint, true);
    assert.equal(cloudBuild.inputSchema.properties.confirm.const, true);
  } finally {
    await writeClient.close();
  }
});

test('MCP write tools dispatch approved project actions to their account-scoped handlers', async () => {
  const calls = [];
  const reader = createReader({
    async createProject(...args) { calls.push(['create_project', ...args]); return { data: { id: 'created' }, error: null }; },
    async renameProject(...args) { calls.push(['rename_project', ...args]); return { data: { id: project.id }, error: null }; },
    async saveProjectFiles(...args) { calls.push(['save_project_files', ...args]); return { data: { files_saved: 1 }, error: null }; },
    async buildAndDeploy(...args) { calls.push(['build_and_deploy_project', ...args]); return { data: { status: 'deployed' }, error: null }; },
    async submitCloudBuild(...args) { calls.push(['start_cloud_build', ...args]); return { data: { status: 'queued' }, error: null }; },
    async getCloudBuildStatus(...args) { calls.push(['get_cloud_build_status', ...args]); return { data: { status: 'completed' }, error: null }; },
  });
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], reader),
  });
  const client = new Client({ name: 'write-tool-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const actions = [
      ['create_project', { name: 'New workspace', project_type: 'website', confirm: true }],
      ['rename_project', { project_id: project.id, name: 'Renamed workspace', confirm: true }],
      ['save_project_files', { project_id: project.id, files: { 'app/page.tsx': 'export default function Page() {}' }, confirm: true }],
      ['build_and_deploy_project', { project_id: project.id, brief: 'Deploy this site', files: [{ path: 'app/page.tsx', content: 'export default function Page() {}' }], confirm: true }],
      ['start_cloud_build', { project_id: project.id, provider: 'godot-build-service', preset: 'Linux/X11', idempotency_key: '55555555-5555-4555-8555-555555555555', confirm: true }],
      ['get_cloud_build_status', { provider: 'godot-build-service', job_id: project.id }],
    ];
    for (const [name, arguments_] of actions) {
      const result = await client.callTool({ name, arguments: arguments_ });
      assert.equal(result.isError, undefined, `${name} should be dispatched successfully`);
    }
    assert.deepEqual(calls, [
      ['create_project', 'authenticated-user', 'New workspace', 'website'],
      ['rename_project', 'authenticated-user', project.id, 'Renamed workspace'],
      ['save_project_files', 'authenticated-user', project.id, { 'app/page.tsx': 'export default function Page() {}' }],
      ['build_and_deploy_project', 'authenticated-user', project.id, 'Deploy this site', [{ path: 'app/page.tsx', content: 'export default function Page() {}' }]],
      ['start_cloud_build', 'authenticated-user', { project_id: project.id, provider: 'godot-build-service', platform: undefined, profile: undefined, preset: 'Linux/X11', idempotency_key: '55555555-5555-4555-8555-555555555555' }],
      ['get_cloud_build_status', 'authenticated-user', 'godot-build-service', project.id],
    ]);
  } finally {
    await client.close();
  }
});

test('OAuth scope parser accepts only read and optional write permissions', () => {
  assert.deepEqual(parseMcpScopes('mcp:read'), ['mcp:read']);
  assert.deepEqual(parseMcpScopes('mcp:read mcp:write'), ['mcp:read', 'mcp:write']);
  assert.equal(parseMcpScopes('mcp:write'), null);
  assert.equal(parseMcpScopes('mcp:read admin'), null);
  assert.equal(MCP_DEFAULT_SCOPE, 'mcp:read mcp:write');
  assert.deepEqual(parseRequestedMcpScopes(null), ['mcp:read', 'mcp:write']);
  assert.deepEqual(parseRequestedMcpScopes('mcp:read'), ['mcp:read']);
  assert.equal(parseRequestedMcpScopes(''), null);
});
