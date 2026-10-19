import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getApplicationCapabilities } from '../lib/builders/application-capabilities.ts';

test('application capability catalog distinguishes implemented adapters from unavailable ones', () => {
  const empty = getApplicationCapabilities({});
  const expo = empty.find((item) => item.id === 'mobile-expo-eas');
  const godot = empty.find((item) => item.id === 'game-godot');
  const android = empty.find((item) => item.id === 'android-native');
  const desktop = empty.find((item) => item.id === 'desktop');
  assert.equal(expo.generator, 'registered_starter');
  assert.equal(expo.buildMode, 'provider_async');
  assert.equal(expo.configured, false);
  assert.equal(godot.buildAdapter, 'Godot build service');
  assert.equal(android.status, 'unavailable');
  assert.equal(android.generator, 'registered_starter');
  assert.equal(android.buildMode, 'async_worker');
  assert.equal(android.projectType, 'mobile_app');
  assert.equal(desktop.status, 'unavailable');
  assert.ok(android.limitations.some((item) => item.includes('reruns the Gradle build')));
});

test('capability configuration is boolean and never contains configured secret values', () => {
  const catalog = getApplicationCapabilities({
    EXPO_TOKEN: 'private-expo-token-value',
    GODOT_BUILD_SERVICE_URL: 'https://godot.example.test',
    GODOT_BUILD_SERVICE_TOKEN: 'private-godot-token-value',
    GITHUB_TOKEN: 'private-github-token-value',
    VERCEL_TOKEN: 'private-vercel-token-value',
    REPOSITORY_RUNNER_URL: 'https://runner.example.test',
    RUNNER_HMAC_SECRET: 'private-runner-secret-value-long-enough',
  });
  const serialized = JSON.stringify(catalog);
  for (const secret of ['private-expo-token-value', 'private-godot-token-value', 'private-github-token-value', 'private-vercel-token-value', 'private-runner-secret-value-long-enough']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(catalog.find((item) => item.id === 'mobile-expo-eas').configured, true);
  assert.equal(catalog.find((item) => item.id === 'game-godot').configured, true);
  assert.equal(catalog.find((item) => item.id === 'repository-operations').configured, true);
});

test('MCP creates real Expo and Godot starter source for mobile and game workspaces', async () => {
  const route = await readFile(new URL('../app/mcp/route.ts', import.meta.url), 'utf8');
  assert.match(route, /createExpoMobileStarter\(name, \{ source: 'mcp_project_creation' \}\)/);
  assert.match(route, /createGodot3dStarter\(name, \{ source: 'mcp_project_creation' \}\)/);
  assert.match(route, /files: starterFiles/);
});
