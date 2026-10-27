import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
async function source(path) { return readFile(new URL(path, root), 'utf8'); }

test('Leo chat creates project then continues into generation instead of returning only a draft notice', async () => {
  const chat = await source('app/api/chat/route.ts');
  assert.match(chat, /status !== 'project_created'/);
  assert.match(chat, /project_id: createdId/);
  assert.match(chat, /Owned project ID:/);
  assert.match(chat, /projectWriteWorkflow/);
  assert.match(chat, /createUserAssistantTools\(ctx\.user\.id, \{ request: req, allowProjectWrites: projectWriteWorkflow, allowRepositoryAccess: repositoryWorkflow, allowRepositoryWrites: repositoryWriteWorkflow, activeProjectId \}\)/);
});

test('project write, run and deployment tools are gated behind an explicit project workflow', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /const projectWriteToolsEnabled = options\.allowProjectWrites \? projectWriteTools : \[\]/);
  assert.match(tools, /name: 'save_project_files'/);
  assert.match(tools, /name: 'run_project_operation'/);
  assert.match(tools, /name: 'deploy_project'/);
  assert.match(tools, /eq\('user_id', userId\)/);
  assert.match(tools, /options\.allowProjectWrites/);
});

test('chat deployment reuses existing build-deploy checks with the saved generated files', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  const route = await source('app/api/build-deploy/route.ts');
  assert.match(tools, /source: 'leo_chat_build_workflow'/);
  assert.match(tools, /generated_files: Object\.entries\(project\.files\)/);
  assert.match(route, /body\.source === 'leo_chat_build_workflow'/);
  assert.match(route, /validateGeneratedSite/);
  assert.match(route, /resolveVerifiedVercelMainUrl/);
});

test('browser game deployment is not falsely reported through the website-only adapter', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /Browser-game publishing requires the separate static-game publication adapter/);
});
