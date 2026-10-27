import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Expo builds use server-only EAS authentication and require a linked static project', async () => {
  const adapter = await source('lib/builders/expo-eas.ts');
  const route = await source('app/api/builds/expo/route.ts');
  assert.match(adapter, /import 'server-only'/);
  assert.match(adapter, /process\.env\.EXPO_TOKEN/);
  assert.match(adapter, /EXPO_TOKEN: token/);
  assert.match(adapter, /easLink\.projectId/);
  assert.match(route, /project:info/);
  assert.match(route, /\.eq\('id', projectId\)\.eq\('user_id', ctx\.user\.id\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_EXPO_TOKEN/);
});

test('cloud build entitlement cannot grant Standard and monthly reservation is atomic', async () => {
  const plan = await source('lib/plan-access.ts');
  const migration = await source('supabase/migrations/20261018150000_cloud_build_jobs.sql');
  assert.match(plan, /plan\.key === 'standard' \|\| plan\.key === 'free'/);
  assert.match(plan, /LEONARDX_MOBILE_APP_PLANS/);
  assert.match(plan, /LEONARDX_GAME_PLANS/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /unique\(owner_user_id, project_id, idempotency_key\)/);
  assert.match(migration, /auth\.uid\(\) = owner_user_id/);
  assert.match(migration, /project type does not match build provider/i);
});

test('browser game workspaces use browser-native generation and have no native build endpoint', async () => {
  const starter = await source('lib/builders/browser-game-starter.ts');
  const setup = await source('app/api/setup/projects/route.ts');
  const capabilities = await source('app/api/builds/capabilities/route.ts');
  assert.match(setup, /createBrowserGameStarter/);
  assert.match(starter, /requestAnimationFrame/);
  assert.match(starter, /three\.module\.js/);
  assert.match(capabilities, /nativeBuildRequired: false/);
  assert.doesNotMatch(setup, /createGodot|api\/builds\/godot/);
  assert.doesNotMatch(capabilities, /GODOT_BUILD_SERVICE_URL|Godot/);
});

test('MCP cloud build tools reuse scoped build APIs and the IDE exposes real job controls', async () => {
  const auth = await source('lib/builds/request-auth.ts');
  const mcp = await source('app/mcp/route.ts');
  const route = await source('app/api/builds/expo/route.ts');
  const tools = await source('lib/mcp/server.ts');
  const panel = await source('components/ide/CloudBuildPanel.tsx');
  assert.match(auth, /validateMcpAccessToken/);
  assert.match(auth, /token\.scopes\.includes\(requiredScope\)/);
  assert.match(mcp, /app\/api\/builds\/expo\/route/);
  assert.doesNotMatch(mcp, /app\/api\/builds\/godot\/route/);
  assert.match(mcp, /new URL\(payload\[key\], request\.url\)/);
  assert.match(mcp, /'download_url', 'status_url', 'artifact_url'/);
  assert.match(tools, /start_cloud_build/);
  assert.match(tools, /callers never supply an Expo UUID/);
  assert.match(route, /provisionExpoProject/);
  assert.match(route, /will_provision: true/);
  assert.match(panel, /if \(link\?\.will_provision\) setNotice/);
  assert.match(route, /will_provision: true/);
  assert.match(route, /eq\('owner_user_id', ctx\.user\.id\)/);
  assert.match(tools, /get_cloud_build_status/);
  assert.match(tools, /confirm: z\.literal\(true\)/);
  assert.match(panel, /api\/builds\/expo/);
  assert.match(panel, /Download artifact/);
  assert.doesNotMatch(panel, /Godot|godot-build-service|game images/i);
});
