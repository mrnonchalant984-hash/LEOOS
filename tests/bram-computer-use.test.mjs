import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Bram browser tasks are owner-only and queued on the private GitHub Actions runtime', async () => {
  const route = await read('app/api/agents/computer-use/route.ts');
  const adapter = await read('lib/runtime/github-actions.ts');
  const orchestrator = await read('lib/ai/tool-orchestrator.ts');
  assert.match(route, /isPlatformOwner/);
  assert.match(route, /queueGitHubRuntimeJob/);
  assert.match(route, /kind:\s*'browser'/);
  assert.match(route, /operation:\s*'computer_use'/);
  assert.match(route, /poll_url/);
  assert.match(orchestrator, /bram_computer_use_status/);
  assert.ok(orchestrator.includes("app/api/runtime/jobs/[id]/route"));
  assert.match(adapter, /browser:new Set\(\['computer_use'\]\)/);
  assert.doesNotMatch(route, /BRAM_BROWSER_RUNTIME_URL|BRAM_BROWSER_RUNTIME_TOKEN/);
});

test('browser task archive is bounded to a public starting hostname and a short task', async () => {
  const route = await read('app/api/agents/computer-use/route.ts');
  assert.match(route, /MAX_TASK = 4000/);
  assert.match(route, /public DNS hostname/);
  assert.match(route, /allowedHosts/);
  assert.match(route, /runtime-metadata\.json/);
});

test('private runtime migration permits browser workload rows', async () => {
  const migration = await read('supabase/migrations/20261127120000_private_browser_runtime.sql');
  assert.match(migration, /private_runtime_jobs_kind_check/);
  assert.match(migration, /'browser'/);
});

test('signed runtime callback removes the private task archive after persisting the result', async () => {
  const callback = await read('app/api/internal/runtime/result/route.ts');
  assert.ok(callback.includes("select('id,storage_path')"));
  assert.ok(callback.includes("storage.from('leo-files').remove"));
});

test('sensitive actions are blocked when the GitHub runtime cannot resume approvals', async () => {
  const route = await read('app/api/agents/computer-use/route.ts');
  assert.match(route, /Sensitive actions are blocked rather than executed/);
  assert.match(route, /Interactive browser approval is not available/);
});
