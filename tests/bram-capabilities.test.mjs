import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/bram/capabilities/route.ts', import.meta.url), 'utf8');

test('Bram capability discovery is authenticated and account scoped', () => {
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /\.eq\(ownerColumn, userId\)/);
  assert.match(route, /\.eq\('user_id', auth\.user\.id\)/);
  assert.match(route, /Cache-Control.*private, no-store/);
});

test('Bram reports independent service states instead of a single backend-connected flag', () => {
  for (const capability of ['authentication', 'database', 'profile', 'project_workspaces', 'chat_history', 'research_history', 'github', 'vercel', 'mcp', 'builder_providers']) {
    assert.match(route, new RegExp(capability + ':'));
  }
  assert.match(route, /'available' \| 'partial' \| 'unavailable' \| 'not_connected'/);
  assert.match(route, /Individual tools still require approval/);
});
