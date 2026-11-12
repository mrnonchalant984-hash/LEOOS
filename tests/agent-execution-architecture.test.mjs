import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('agent execution keeps tool policy, cancellation, and retry handling explicit', async () => {
  const manager = await read('lib/agents/manager.ts');
  const contracts = await read('lib/agents/contracts.ts');
  const orchestrator = await read('lib/ai/tool-orchestrator.ts');

  assert.match(manager, /AbortSignal\.timeout\(agent\.timeoutMs\)/);
  assert.match(manager, /agent\.maxRetries/);
  assert.match(contracts, /approvalRequired/);
  assert.match(orchestrator, /agentPolicy/);
});

test('durable agent worker authenticates, claims bounded jobs, and scopes each run to its owner', async () => {
  const worker = await read('app/api/internal/agents/worker/route.ts');
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /claim_agent_jobs/);
  assert.match(worker, /from\('agent_runs'\)[\s\S]*?\.eq\('id', job\.run_id\)[\s\S]*?\.eq\('user_id', job\.user_id\)/);
  assert.match(worker, /finalize_agent_job/);
});

test('agent job finalization is atomic and service-role only', async () => {
  const migration = await read('supabase/migrations/20261019170000_agent_job_atomic_finalization.sql');
  assert.match(migration, /create or replace function public\.finalize_agent_job/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /where id = target\.run_id and user_id = target\.user_id/i);
  assert.match(migration, /revoke all on function public\.finalize_agent_job[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.finalize_agent_job[\s\S]*to service_role/i);
});

test('cancellation is limited to the authenticated owner and persisted queued jobs', async () => {
  const route = await read('app/api/agents/cancel/route.ts');
  assert.match(route, /getProfile/);
  assert.match(route, /\.eq\('user_id',\s*ctx\.user\.id\)/);
  assert.match(route, /cancelledRun/);
  assert.match(route, /waiting_approval/);
});

test('agent registry keeps the SEO tuple aligned and validates instruction types', async () => {
  const registry = await read('lib/agents/registry.ts');
  const contracts = await read('lib/agents/contracts.ts');
  assert.match(registry, /'seo','SEO Agent'.*'website','Review the public site/);
  assert.match(contracts, /typeof definition\.instructions !== 'string'/);
});
