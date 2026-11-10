import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('runner requests derive the tenant scope from the authenticated account', async () => {
  const route = await readFile(new URL('../app/api/workforce/repository-runner/route.ts', import.meta.url), 'utf8');
  const projectRunner = await readFile(new URL('../lib/project-runner.ts', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../services/isolated-runner/server.py', import.meta.url), 'utf8');
  const sandboxRoute = await readFile(new URL('../app/api/leocode/sandbox/route.ts', import.meta.url), 'utf8');

  assert.match(route, /tenant_id: ctx\.user\.id/);
  assert.match(projectRunner, /tenant_id: input\.ownerId/);
  assert.match(runner, /tenant_id = body\.get\('tenant_id'\)/);
  assert.match(runner, /tenant_root = tenant_workspace_root\(tenant_id\)/);
  assert.match(runner, /def delete_tenant_workspace/);
  assert.match(runner, /def do_DELETE/);
  assert.match(sandboxRoute, /export async function DELETE/);
  assert.match(sandboxRoute, /tenant_id: context\.user\.id/);
});
