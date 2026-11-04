import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
async function source(path) { return readFile(new URL(path, root), 'utf8'); }

test('Leo chat enables project creation and generation only for explicit build requests', async () => {
  const chat = await source('app/api/chat/route.ts');
  assert.match(chat, /const buildMode = Boolean\(ctx && explicitBuildIntent && !customAgent\)/);
  assert.match(chat, /allowBuildActions: buildMode/);
  assert.match(chat, /allowDeployment: explicitDeploymentIntent/);
  assert.match(chat, /allowRepositoryWrites: repositoryWriteWorkflow/);
});

test('project creation, file writes, and deployment tools are gated by explicit request state', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /if \(options\?\.allowBuildActions\)/);
  assert.match(tools, /name: 'save_project_files'/);
  assert.match(tools, /name: 'build_and_deploy_project'/);
  assert.match(tools, /eq\('user_id', userId\)/);
  assert.match(tools, /options\.allowDeployment/);
});

test('chat deployment reuses existing build-deploy checks with the saved generated files', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  const route = await source('app/api/build-deploy/route.ts');
  assert.match(tools, /source: 'leo_chat'/);
  assert.match(tools, /generated_files: files/);
  assert.match(route, /body\.source === 'leo_chat'/);
  assert.match(route, /validateGeneratedSite/);
  assert.match(route, /resolveVerifiedVercelMainUrl/);
});

test('browser game publication uses its separately authorized static-game adapter', async () => {
  const tools = await source('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /name: 'publish_browser_game'/);
  assert.match(tools, /options\.allowDeployment && options\.allowBrowserGame/);
  assert.match(tools, /reference\.kind === 'publish_browser_game'/);
});
