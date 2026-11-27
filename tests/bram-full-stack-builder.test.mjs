import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('Bram chat injects the complete full-stack website engineering contract for build requests', async () => {
  const [chat, builder] = await Promise.all([
    read('app/api/chat/route.ts'),
    read('lib/agents/website-builder.ts'),
  ]);
  assert.match(chat, /getBramWebsiteEngineeringContext/);
  assert.match(chat, /buildMode \? 16000/);
  assert.match(chat, /buildMode \? 8/);
  for (const capability of [
    'WORK DIRECTLY IN CHAT',
    'PREMIUM FRONTEND',
    'REAL FULL-STACK BEHAVIOR',
    'SOURCE WORKSPACE',
    'ISOLATED PREVIEW',
    'TEST AND REPAIR',
    'GITHUB AND VERCEL',
    'QUALITY GATE',
  ]) assert.ok(builder.includes(capability), 'missing engineering phase: ' + capability);
});

test('Bram edits preserve existing project files and validate the merged project', async () => {
  const tools = await read('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /save_mode: 'merge_preserving_existing_files'/);
  assert.match(tools, /const existingFiles = current\.files/);
  assert.match(tools, /const mergedFiles/);
  assert.match(tools, /validateIdeFiles\(mergedFiles\)/);
  assert.match(tools, /mergeWorkspaceTextFiles/);
  assert.match(tools, /\.eq\('id', projectId\)\.eq\('user_id', userId\)/);
});

test('Bram can queue isolated previews and inspect provider-confirmed status from chat', async () => {
  const tools = await read('lib/ai/tool-orchestrator.ts');
  const manager = await read('lib/agents/manager.ts');
  assert.match(tools, /name: 'create_project_preview'/);
  assert.match(tools, /name: 'get_project_preview_status'/);
  assert.match(tools, /\/api\/workspaces\/\$\{encodeURIComponent\(projectId\)\}\/preview/);
  assert.match(tools, /Isolated preview only/);
  assert.match(manager, /create_project_preview','get_project_preview_status/);
});

test('Bram can queue and poll isolated inspect, typecheck, lint, test and build operations', async () => {
  const tools = await read('lib/ai/tool-orchestrator.ts');
  const manager = await read('lib/agents/manager.ts');
  assert.match(tools, /name: 'run_project_checks'/);
  assert.match(tools, /name: 'get_project_check_status'/);
  assert.match(tools, /'inspect','typecheck','lint','test','build'/);
  assert.match(tools, /\/api\/runtime\/jobs\//);
  assert.match(manager, /run_project_checks','get_project_check_status/);
});

test('the primary Bram agent has explicit least-privilege website build, file and deployment capabilities', async () => {
  const registry = await read('lib/agents/registry.ts');
  assert.match(registry, /\['bram','Bram'/);
  assert.match(registry, /'file_write','project_read','website_builder','deployment'/);
  assert.match(registry, /Production deployment is permitted only through the existing authorized deployment tool/);
});

test('chat does not render a project setup card that sends users out of Bram', async () => {
  const widget = await read('components/LEOWidget.tsx');
  assert.doesNotMatch(widget, /\{m\.projectBuilder && \(/);
});
