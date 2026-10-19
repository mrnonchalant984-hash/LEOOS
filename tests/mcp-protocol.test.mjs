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
    async getAndroidBuildCapabilities() { return { data: { java: false, gradle: false, androidSdk: false, artifactStorageCredentialsPresent: false, buildable: false }, error: null }; },
    async getCloudBuildLogs(_userId, provider, jobId) { return { data: { provider, job_id: jobId, logs: 'build log' }, error: null }; },
    async leoAiChat(_userId, input) { return { data: { status: 'completed', session_id: input.session_id || 'chat-session', reply: 'Leo reply', provider: 'openai', model: 'gpt-4o-mini' }, error: null }; },
    async leoAiGetExecutionStatus(_userId, requestId) { return { data: { id: requestId, status: 'completed' }, error: null }; },
    async listAvailableAgents() { return { data: { agents: [{ id: 'code-review', execution: 'durable_agent_worker' }] }, error: null }; },
    async invokeAgent(_userId, input) { return { data: { run_id: 'agent-run', agent_id: input.agent_id, status: 'queued' }, error: null }; },
    async getAgentExecutionStatus(_userId, runId) { return { data: { id: runId, status: 'queued' }, error: null }; },
    async listAgentExecutions() { return { data: [{ id: 'agent-run', status: 'queued' }], error: null }; },
    async cancelAgentExecution(_userId, runId) { return { data: { run_id: runId, status: 'cancelled' }, error: null }; },
    async approveAgentExecution(_userId, approvalId) { return { data: { approval_id: approvalId, status: 'completed' }, error: null }; },
    async buildAndroidCalculator(_userId, key) { return { data: { job_id: 'android-job', status: 'completed', idempotency_key: key, download_url: 'https://mcp.test/api/builds/android/android-job/artifact' }, error: null }; },
    async getAndroidBuildStatus(_userId, jobId) { return { data: { id: jobId, status: 'completed' }, error: null }; },
    async planEngineeringWorkflow(_userId, input) {
      return { data: { orderedStages: ['REQUEST_RECEIVED'], projectType: input.projectType }, error: null };
    },
    async createEngineeringWorkflow() { return { data: { id: 'workflow' }, error: null }; },
    async advanceEngineeringWorkflow() { return { data: { status: 'RUNNING' }, error: null }; },
    async cancelEngineeringWorkflow() { return { data: { status: 'CANCELLED' }, error: null }; },
    async runProjectOperation(_userId, projectId, operation) { return { data: { job_id: projectId, status: 'completed', operation }, error: null }; },
    async retryCloudBuild(_userId, provider, jobId) { return { data: { job_id: jobId, provider, status: 'queued' }, error: null }; },
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
      'discover_application_capabilities',
      'get_account_plan',
      'get_agent_details',
      'get_agent_execution_status',
      'get_android_build_capabilities',
      'get_android_build_status',
      'get_capability_alternatives',
      'get_cloud_build_logs',
      'get_cloud_build_status',
      'get_configuration_status',
      'get_engineering_workflow_status',
      'get_project_hosting_status',
      'get_project_status',
      'leo_ai_get_execution_status',
      'list_agent_executions',
      'list_ai_providers',
      'list_available_agents',
      'list_projects',
      'plan_engineering_workflow',
      'read_project_files',
    ]);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));

    const capabilities = await client.callTool({ name: 'discover_application_capabilities', arguments: {} });
    assert.equal(capabilities.isError, undefined);
    const catalog = JSON.parse(capabilities.content[0].text).capabilities;
    assert.ok(catalog.some(item => item.id === 'mobile-expo-eas' && item.buildMode === 'provider_async'));
    assert.ok(catalog.some(item => item.id === 'android-native' && item.status === 'unavailable'));
    const providers = await client.callTool({ name: 'list_ai_providers', arguments: {} });
    assert.ok(Array.isArray(JSON.parse(providers.content[0].text)));
    const agents = await client.callTool({ name: 'list_available_agents', arguments: {} });
    assert.equal(JSON.parse(agents.content[0].text).agents[0].id, 'code-review');
    const details = await client.callTool({ name: 'get_agent_details', arguments: { agent_id: 'code-review' } });
    assert.equal(JSON.parse(details.content[0].text).id, 'code-review');
    const aiStatus = await client.callTool({ name: 'leo_ai_get_execution_status', arguments: { request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } });
    assert.equal(JSON.parse(aiStatus.content[0].text).status, 'completed');

    const result = await client.callTool({ name: 'list_projects', arguments: { limit: 10 } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), [project]);
    const logs = await client.callTool({ name: 'get_cloud_build_logs', arguments: { provider: 'expo-eas', job_id: '88888888-8888-4888-8888-888888888888' } });
    assert.equal(JSON.parse(logs.content[0].text).logs, 'build log');
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
    const leoChat = tools.find(tool => tool.name === 'leo_ai_chat');
    assert.deepEqual(tools.map(tool => tool.name).sort(), [
      'advance_engineering_workflow',
      'approve_agent_execution',
      'build_and_deploy_project',
      'build_android_calculator',
      'cancel_agent_execution',
      'cancel_engineering_workflow',
      'create_engineering_workflow',
      'create_project',
      'discover_application_capabilities',
      'get_account_plan',
      'get_agent_details',
      'get_agent_execution_status',
      'get_android_build_capabilities',
      'get_android_build_status',
      'get_capability_alternatives',
      'get_cloud_build_logs',
      'get_cloud_build_status',
      'get_configuration_status',
      'get_engineering_workflow_status',
      'get_project_hosting_status',
      'get_project_status',
      'invoke_agent',
      'leo_ai_chat',
      'leo_ai_get_execution_status',
      'list_agent_executions',
      'list_ai_providers',
      'list_available_agents',
      'list_projects',
      'plan_engineering_workflow',
      'read_project_files',
      'rename_project',
      'retry_cloud_build',
      'run_project_operation',
      'save_project_files',
      'start_cloud_build',
    ]);
    assert.ok(create);
    assert.ok(deploy);
    assert.ok(cloudBuild);
    assert.ok(leoChat);
    assert.equal(leoChat.inputSchema.properties.confirm.const, true);
    assert.ok(leoChat.inputSchema.properties.fallback_model);
    assert.equal(create.inputSchema.properties.confirm.const, true);
    assert.equal(deploy.annotations?.destructiveHint, true);
    assert.equal(cloudBuild.inputSchema.properties.confirm.const, true);
    assert.equal(tools.find(tool => tool.name === 'run_project_operation').inputSchema.properties.confirm.const, true);
    assert.equal(tools.find(tool => tool.name === 'retry_cloud_build').inputSchema.properties.confirm.const, true);
    assert.equal(tools.find(tool => tool.name === 'cancel_agent_execution').inputSchema.properties.confirm.const, true);
    assert.equal(tools.find(tool => tool.name === 'approve_agent_execution').inputSchema.properties.confirm.const, true);
  } finally {
    await writeClient.close();
  }
});

test('owner-managed text-agent tools are exposed only when the backend marks the account owner', async () => {
  const ordinaryTransport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], createReader()),
  });
  const ordinaryClient = new Client({ name: 'ordinary-agent-tools', version: '1.0.0' }, { capabilities: {} });
  try {
    await ordinaryClient.connect(ordinaryTransport);
    const { tools } = await ordinaryClient.listTools();
    assert.equal(tools.some(tool => ['create_agent', 'update_agent', 'enable_agent', 'disable_agent'].includes(tool.name)), false);
  } finally { await ordinaryClient.close(); }

  const calls = [];
  const ownerReader = createReader({
    isPlatformOwner: true,
    async createRegisteredAgent(...args) { calls.push(['create', ...args]); return { data: { id: 'mcp-agent', enabled: false }, error: null }; },
    async updateRegisteredAgent(...args) { calls.push(['update', ...args]); return { data: { id: 'mcp-agent' }, error: null }; },
    async setRegisteredAgentEnabled(...args) { calls.push(['enabled', ...args]); return { data: { id: args[1], enabled: args[2] }, error: null }; },
  });
  const ownerTransport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-owner', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], ownerReader),
  });
  const ownerClient = new Client({ name: 'owner-agent-tools', version: '1.0.0' }, { capabilities: {} });
  try {
    await ownerClient.connect(ownerTransport);
    const { tools } = await ownerClient.listTools();
    for (const tool of ['create_agent', 'update_agent', 'enable_agent', 'disable_agent']) assert.ok(tools.some(item => item.name === tool));
    const result = await ownerClient.callTool({ name: 'create_agent', arguments: {
      name: 'Release Notes', category: 'knowledge', description: 'Draft release notes',
      instructions: 'Summarize only verified changes and never claim an action was performed.', confirm: true,
    } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(calls[0], ['create', 'authenticated-owner', {
      name: 'Release Notes', category: 'knowledge', description: 'Draft release notes',
      instructions: 'Summarize only verified changes and never claim an action was performed.',
    }]);
  } finally { await ownerClient.close(); }
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
    async leoAiChat(...args) { calls.push(['leo_ai_chat', ...args]); return { data: { status: 'completed', reply: 'Leo reply' }, error: null }; },
    async invokeAgent(...args) { calls.push(['invoke_agent', ...args]); return { data: { run_id: 'agent-run', status: 'queued' }, error: null }; },
    async approveAgentExecution(...args) { calls.push(['approve_agent_execution', ...args]); return { data: { approval_id: args[1], status: 'completed' }, error: null }; },
  });
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], reader),
  });
  const client = new Client({ name: 'write-tool-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const actions = [
      ['create_project', { name: 'New workspace', project_type: 'website', confirm: true }],
      ['create_project', { name: 'Shopping app', project_type: 'mobile_app', confirm: true }],
      ['rename_project', { project_id: project.id, name: 'Renamed workspace', confirm: true }],
      ['save_project_files', { project_id: project.id, files: { 'app/page.tsx': 'export default function Page() {}' }, confirm: true }],
      ['build_and_deploy_project', { project_id: project.id, brief: 'Deploy this site', files: [{ path: 'app/page.tsx', content: 'export default function Page() {}' }], idempotency_key: '11111111-1111-4111-8111-111111111111', confirm: true }],
      ['start_cloud_build', { project_id: project.id, provider: 'godot-build-service', preset: 'Linux/X11', idempotency_key: '55555555-5555-4555-8555-555555555555', confirm: true }],
      ['start_cloud_build', { project_id: project.id, provider: 'expo-eas', idempotency_key: '77777777-7777-4777-8777-777777777777', confirm: true }],
      ['leo_ai_chat', { message: 'Explain this project', project_id: project.id, fallback_model: 'anthropic/claude-3-5-haiku-latest', idempotency_key: '99999999-9999-4999-8999-999999999999', confirm: true }],
      ['invoke_agent', { agent_id: 'code-review', task: 'Review my code', idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', confirm: true }],
      ['cancel_agent_execution', { run_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', confirm: true }],
      ['approve_agent_execution', { approval_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', confirm: true }],
      ['get_cloud_build_status', { provider: 'godot-build-service', job_id: project.id }],
      ['run_project_operation', { project_id: project.id, operation: 'test', confirm: true }],
      ['retry_cloud_build', { provider: 'godot-build-service', job_id: project.id, confirm: true }],
    ];
    for (const [name, arguments_] of actions) {
      const result = await client.callTool({ name, arguments: arguments_ });
      assert.equal(result.isError, undefined, `${name} should be dispatched successfully`);
    }
    assert.deepEqual(calls, [
      ['create_project', 'authenticated-user', 'New workspace', 'website'],
      ['create_project', 'authenticated-user', 'Shopping app', 'mobile_app'],
      ['rename_project', 'authenticated-user', project.id, 'Renamed workspace'],
      ['save_project_files', 'authenticated-user', project.id, { 'app/page.tsx': 'export default function Page() {}' }],
      ['build_and_deploy_project', 'authenticated-user', project.id, 'Deploy this site', [{ path: 'app/page.tsx', content: 'export default function Page() {}' }], '11111111-1111-4111-8111-111111111111'],
      ['start_cloud_build', 'authenticated-user', { project_id: project.id, provider: 'godot-build-service', platform: undefined, profile: undefined, preset: 'Linux/X11', idempotency_key: '55555555-5555-4555-8555-555555555555' }],
      ['start_cloud_build', 'authenticated-user', { project_id: project.id, provider: 'expo-eas', platform: 'android', profile: 'preview', preset: undefined, idempotency_key: '77777777-7777-4777-8777-777777777777' }],
      ['leo_ai_chat', 'authenticated-user', { message: 'Explain this project', project_id: project.id, session_id: undefined, model: undefined, fallback_model: 'anthropic/claude-3-5-haiku-latest', idempotency_key: '99999999-9999-4999-8999-999999999999' }],
      ['invoke_agent', 'authenticated-user', { agent_id: 'code-review', task: 'Review my code', context: undefined, idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      ['approve_agent_execution', 'authenticated-user', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
      ['get_cloud_build_status', 'authenticated-user', 'godot-build-service', project.id],
    ]);
  } finally {
    await client.close();
  }
});

test('MCP calculator build requires write scope and dispatches idempotently with resumable status', async () => {
  const calls = [];
  const reader = createReader({
    async buildAndroidCalculator(...args) { calls.push(['build', ...args]); return { data: { job_id: 'android-job', status: 'completed', download_url: '/api/builds/android/android-job/artifact' }, error: null }; },
    async getAndroidBuildStatus(...args) { calls.push(['status', ...args]); return { data: { id: args[1], status: 'completed' }, error: null }; },
  });
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: async (input, init) => handleUserMcpRequest(new Request(input, init), 'authenticated-user', [MCP_READ_SCOPE, MCP_WRITE_SCOPE], reader),
  });
  const client = new Client({ name: 'android-mcp-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'build_android_calculator', arguments: { idempotency_key: '33333333-3333-4333-8333-333333333333', confirm: true } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).job_id, 'android-job');
    const status = await client.callTool({ name: 'get_android_build_status', arguments: { job_id: '44444444-4444-4444-8444-444444444444' } });
    assert.equal(JSON.parse(status.content[0].text).status, 'completed');
    assert.deepEqual(calls, [
      ['build', 'authenticated-user', '33333333-3333-4333-8333-333333333333'],
      ['status', 'authenticated-user', '44444444-4444-4444-8444-444444444444'],
    ]);
  } finally { await client.close(); }
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
