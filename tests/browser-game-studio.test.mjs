import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Browser Game Studio previews saved project HTML in a non-same-origin sandbox and exposes diagnostics', async () => {
  const component = await read('components/games/BrowserGameStudio.tsx');
  assert.match(component, /sandbox="allow-scripts"/);
  assert.doesNotMatch(component, /sandbox="[^"]*allow-same-origin/);
  assert.match(component, /leonardx-game-preview/);
  assert.match(component, /unhandledrejection/);
  assert.match(component, /Restart/);
  assert.match(component, /Save source/);
  assert.match(component, /Export ZIP/);
});

test('browser game ZIP endpoint verifies authentication, ownership, game type, entry point and strips secrets', async () => {
  const route = await read('app/api/games/[id]/export/route.ts');
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /\.eq\('id', id\)\.eq\('user_id', context\.user\.id\)/);
  assert.match(route, /project\.type !== 'game'/);
  assert.match(route, /project\.files\['index\.html'\]/);
  assert.match(route, /new JSZip\(\)/);
  assert.match(route, /\.zip/);
  assert.match(route, /node_modules|private-key/);
});

test('explicit browser-game builds use account-scoped tools and the existing plan-checked setup route', async () => {
  const chat = await read('app/api/chat/route.ts');
  const setup = await read('app/api/setup/projects/route.ts');
  const tools = await read('lib/ai/tool-orchestrator.ts');
  assert.match(chat, /isExplicitBuildIntent\(message\)/);
  assert.match(chat, /allowBuildActions: buildMode/);
  assert.match(chat, /allowBrowserGame: requestedProjectType === 'game'/);
  assert.match(setup, /planAllowsCloudProject\(plan, projectType, owner\)/);
  assert.match(setup, /createBrowserGameStarter/);
  assert.match(tools, /projectType === 'game'/);
  assert.match(tools, /postAsUser\(options\.request, '\/api\/setup\/projects'/);
});

test('engine compilation is retired from active game setup, MCP native build tools, and the service tree', async () => {
  const setup = await read('app/api/setup/projects/route.ts');
  const mcp = await read('lib/mcp/server.ts');
  const migration = await read('supabase/migrations/20261027160000_retire_engine_game_builds.sql');
  assert.match(setup, /createBrowserGameStarter/);
  assert.doesNotMatch(setup, /createGodot|api\/builds\/godot/);
  assert.match(mcp, /create_browser_game/);
  assert.match(mcp, /export_browser_game_project/);
  assert.doesNotMatch(mcp, /z\.enum\(\['expo-eas', 'godot-build-service'\]\)/);
  assert.match(migration, /p_provider <> 'expo-eas'/);
  assert.match(migration, /Native engine game builds are retired/);
});

test('Leo chat tool mode can read and save owner-scoped workspace source without pushing or deploying', async () => {
  const tools = await read('lib/ai/tool-orchestrator.ts');
  assert.match(tools, /name: 'get_project_files'/);
  assert.match(tools, /name: 'save_project_files'/);
  assert.match(tools, /\.eq\('id', projectId\)\.eq\('user_id', userId\)/);
  assert.match(tools, /options\?\.allowBuildActions/);
  assert.match(tools, /options\.allowDeployment/);
  assert.match(tools, /validateIdeFiles\(files\)/);
  assert.match(tools, /Files were not saved: provide an owned project ID/);
});
