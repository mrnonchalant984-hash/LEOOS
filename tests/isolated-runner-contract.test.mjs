import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('runtime jobs are queued from authenticated account-owned workspaces', async () => {
  const route = await readFile(new URL('../app/api/workforce/repository-runner/route.ts', import.meta.url), 'utf8');
  const projectRunner = await readFile(new URL('../lib/project-runner.ts', import.meta.url), 'utf8');
  const sandboxRoute = await readFile(new URL('../app/api/leocode/sandbox/route.ts', import.meta.url), 'utf8');

  assert.match(route, /requireOwner\(req\)/);
  assert.match(route, /getWorkspaceManifest\(ctx\.user\.id,body\.project_id\)/);
  assert.match(route, /userId:ctx\.user\.id/);
  assert.match(projectRunner, /userId: input\.ownerId/);
  assert.match(sandboxRoute, /getProfile\(req\)/);
  assert.match(sandboxRoute, /userId:ctx\.user\.id/);
  assert.match(sandboxRoute, /export async function DELETE/);
  assert.match(sandboxRoute, /status:410/);
  assert.doesNotMatch(route + sandboxRoute, /LEO_SANDBOX_URL|REPOSITORY_RUNNER_URL|RUNNER_HMAC_SECRET/);
});
