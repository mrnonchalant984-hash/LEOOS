import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('approved agents receive request context and preserve execution diagnostics', async () => {
  const approval = await readFile(new URL('../app/api/agents/approve/route.ts', import.meta.url), 'utf8');
  const manager = await readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  const runRoute = await readFile(new URL('../app/api/agents/run/route.ts', import.meta.url), 'utf8');

  assert.match(approval, /request:\s*req/);
  assert.match(approval, /persistAgentRun:\s*true/);
  assert.match(manager, /repositoryAccess = Boolean\(meta\?\.request\)/);
  assert.match(manager, /allowRepositoryAccess:\s*repositoryAccess/);
  assert.match(manager, /available_tool_names:\s*tools\.map/);
  assert.match(manager, /request_context_available:\s*Boolean\(meta\?\.request\)/);
  assert.match(runRoute, /select\('metadata'\)/);
  assert.match(runRoute, /\.\.\.\(latestRun\.metadata \|\| \{\}\)/);
});

test('repository tools are exposed only through explicit request-scoped permissions', async () => {
  const manager = await readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  const orchestrator = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');

  assert.match(manager, /\['repository_read', 'github_read', 'github_write', 'file_read'\]/);
  assert.match(manager, /toolName === 'github_repository_tree'/);
  assert.match(orchestrator, /if \(options\?\.allowRepositoryAccess\)/);
  assert.match(orchestrator, /Connected repository access is not enabled for this request/);
});

test('agent status MCP response exposes safe persisted execution diagnostics', async () => {
  const mcp = await readFile(new URL('../app/mcp/route.ts', import.meta.url), 'utf8');
  assert.match(mcp, /select\('id,agent_id,task,status,result,error,created_at,started_at,completed_at,metadata'\)/);
  assert.match(mcp, /execution,\s*\n/);
});

test('Developer Agent permissions retain injected GitHub repository tools', async () => {
  const { getAgentAvailableTools } = await import('../lib/agents/manager.ts');
  const agent = {
    id: 'developer',
    allowedTools: ['repository_read', 'file_read'],
    ownerOnly: false,
  };
  const injected = [
    { name: 'github_repository_tree' },
    { name: 'github_read_file' },
    { name: 'github_commit_status' },
    { name: 'github_commit_files' },
    { name: 'get_project_files' },
  ];
  const available = getAgentAvailableTools(agent, injected, 'inspect the repository');
  assert.deepEqual(available.map(tool => tool.name), [
    'github_repository_tree',
    'github_read_file',
    'github_commit_status',
    'get_project_files',
  ]);
});
