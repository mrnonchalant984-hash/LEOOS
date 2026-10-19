import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('durable agent queue has a five-minute protected external scheduler', async () => {
  const workflow = await read('.github/workflows/agent-queue-worker.yml');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /secrets\.LEONARDX_BASE_URL/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(workflow, /\$\{#CRON_SECRET\} -lt 32/);
  assert.match(workflow, /https:\/\//);
  assert.match(workflow, /api\/internal\/agents\/worker/);
  assert.match(workflow, /max-time 55/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /echo\s+['\"]?\$CRON_SECRET/i);
  assert.doesNotMatch(workflow, /printf[^\n]*\$CRON_SECRET/i);
});

test('agent worker atomically claims one job and keeps the database lease recovery path', async () => {
  const worker = await read('app/api/internal/agents/worker/route.ts');
  const migration = await read('supabase/migrations/20261014120000_production_workforce_hardening.sql');
  assert.match(worker, /req\.headers\.get\('authorization'\) !== `Bearer \$\{secret\}`/);
  assert.match(worker, /claim_agent_jobs/);
  assert.match(worker, /p_limit: 1/);
  assert.match(worker, /p_lease_seconds: 90/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_expires_at < now\(\)/);
  assert.match(migration, /attempts < 3/);
  assert.match(worker, /finalize_agent_job/);
  assert.match(worker, /\.eq\('user_id', job\.user_id\)/);
  assert.match(worker, /agentAllowed\(agent\.id, plan\.key, owner\)/);
  assert.match(worker, /agent\.ownerOnly && !owner/);
  assert.match(worker, /safeAgentFailureCode/);
  assert.match(worker, /provider_rate_limited/);
  assert.match(worker, /provider_timeout/);
  assert.match(worker, /browser_session_failed/);
  assert.doesNotMatch(worker, /last_error:\s*cause\.message/);
});

test('owner monitoring exposes aggregate agent queue health without prompts or results', async () => {
  const route = await read('app/api/workforce/monitoring/route.ts');
  const page = await read('app/workforce/monitoring/page.tsx');
  assert.match(route, /requireOwner\(req\)/);
  assert.match(route, /from\('agent_jobs'\)\.select\('id,status,created_at,updated_at,attempts,lease_expires_at'\)/);
  assert.match(route, /oldest_queued_age_seconds/);
  assert.match(route, /expired_leases/);
  assert.match(route, /retry_attempts_sampled/);
  assert.match(route, /last_successful_completion/);
  assert.doesNotMatch(route, /select\([^)]*task/);
  assert.doesNotMatch(route, /select\([^)]*result/);
  assert.match(page, /Durable agent queue/);
  assert.match(page, /does not prove the scheduler is alive/);
});


test('agent run result and queue status finalize atomically under the current live lease', async () => {
  const worker = await read('app/api/internal/agents/worker/route.ts');
  const migration = await read('supabase/migrations/20261019170000_agent_job_atomic_finalization.sql');
  assert.match(worker, /db\.rpc\('finalize_agent_job'/);
  assert.match(migration, /status = 'running' and locked_by = p_worker/i);
  assert.match(migration, /lease_expires_at > now\(\)/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /update public\.agent_runs/i);
  assert.match(migration, /update public\.agent_jobs/i);
  assert.match(migration, /revoke all on function public\.finalize_agent_job[\s\S]*grant execute[\s\S]*service_role/i);
  assert.match(migration, /if not found then\s+return false/i);
  assert.match(migration, /p_retry_at is null/i);
});

test('agent worker does not store raw provider exception messages', async () => {
  const worker = await read('app/api/internal/agents/worker/route.ts');
  assert.match(worker, /safeAgentFailureCode/);
  assert.match(worker, /p_job_error: code/);
  assert.doesNotMatch(worker, /last_error:\s*cause\.message/);
  assert.doesNotMatch(worker, /error:\s*cause\.message/);
});
