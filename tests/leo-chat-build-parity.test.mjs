import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const tools = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
const buildRoute = await readFile(new URL('../app/api/build-deploy/route.ts', import.meta.url), 'utf8');

test('explicit website build requests activate the existing Leo tool orchestrator from normal chat', () => {
  assert.match(route, /explicitBuildIntent/);
  assert.match(route, /mode === "tools" \|\| buildMode/);
  assert.match(route, /createUserAssistantTools\(ctx\.user\.id, \{ request: req, userMessage: message, allowBuildActions: buildMode/);
  assert.match(route, /requestedProjectType && projectBuilder && !buildMode/);
});

test('Leo build tools create an owned project and persist generated files with path validation', () => {
  assert.match(tools, /name: 'get_project_files'/);
  assert.match(tools, /name: 'get_build_status'/);
  assert.match(tools, /name: 'create_project'/);
  assert.match(tools, /name: 'save_project_files'/);
  assert.match(tools, /create_customer_project/);
  assert.match(tools, /\.eq\('user_id', userId\)/);
  assert.match(tools, /validateIdeFiles\(files\)/);
  assert.match(tools, /files_persisted: true/);
});

test('production deployment tool is only registered for explicit deploy intent and requires verified success', () => {
  assert.match(route, /explicitDeploymentIntent/);
  assert.match(tools, /if \(options\.allowDeployment\) buildTools\.push/);
  assert.match(tools, /if \(!options\?\.allowDeployment\)/);
  assert.match(tools, /body\.status !== 'deployed'/);
  assert.match(tools, /body\.liveUrl/);
  assert.match(tools, /idempotency_key: idempotencyKey/);
});

test('Leo deployment reuses the existing authenticated build/deploy route rather than inventing a URL', () => {
  assert.match(tools, /POST as buildDeployPost \} from '@\/app\/api\/build-deploy\/route'/);
  assert.match(tools, /new NextRequest\(new URL\('\/api\/build-deploy'/);
  assert.match(tools, /Project not found in your account/);
  assert.match(tools, /Deployment was not started/);
});

test('existing build/deploy route accepts Leo-chat generated files without skipping authenticated ownership and plan checks', () => {
  assert.match(buildRoute, /const suppliedFilesFromLeoChat = !mcpExternalModel && body\.source === 'leo_chat'/);
  assert.match(buildRoute, /if \(mcpExternalModel \|\| suppliedFilesFromLeoChat\)/);
  assert.match(buildRoute, /\.eq\('owner_user_id', ctx\.user\.id\)/);
  assert.match(buildRoute, /planAllows\(plan, requiredFeature\)/);
  assert.match(buildRoute, /validateGeneratedSite\(\{ files: suppliedMcpFiles \}, false\)/);
});
