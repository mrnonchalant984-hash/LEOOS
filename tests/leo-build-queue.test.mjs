import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const buildRoute = await readFile(new URL('../app/api/build-deploy/route.ts', import.meta.url), 'utf8');
const workerRoute = await readFile(new URL('../app/api/internal/builds/worker/route.ts', import.meta.url), 'utf8');
const progressRoute = await readFile(new URL('../app/api/chat/build-progress/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261029190000_durable_leo_build_jobs.sql', import.meta.url), 'utf8');
const widget = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/leo-build-queue-worker.yml', import.meta.url), 'utf8');
const tools = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');

test('Leo chat deployment requests are durably queued and idempotent before returning 202', () => {
  assert.match(buildRoute, /body\.background === true/);
  assert.match(buildRoute, /from\('leo_build_jobs'\)\.insert/);
  assert.match(buildRoute, /status: 'queued'/);
  assert.match(buildRoute, /status: 'queued', queued: true, jobId: queued\.id/);
  assert.match(buildRoute, /Background queuing is currently restricted to Leo-chat generated source/);
  assert.match(tools, /background: true/);
  assert.match(tools, /response\.status === 202[\s\S]*body\?\.queued === true/);
});

test('worker claims jobs with leases and requires a confirmed deployed state before success', () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_expires_at/);
  assert.match(workerRoute, /headers.get\('authorization'\)/);
  assert.match(workerRoute, /claim_leo_build_jobs/);
  assert.match(workerRoute, /body\?\.status === 'deployed'/);
  assert.match(workerRoute, /https:/);
  assert.match(workerRoute, /job\.attempts \|\| 1/);
});

test('build state transitions persist deployment_events and chat can poll account-scoped progress', () => {
  assert.match(buildRoute, /event_type: `build_\$\{status\}`/);
  assert.match(progressRoute, /getProfile\(req\)/);
  assert.match(progressRoute, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(progressRoute, /deployment_events/);
  assert.match(widget, /api\/chat\/build-progress/);
  assert.match(widget, /Updating from saved build events/);
  assert.match(widget, /Open verified live website/);
});

test('GitHub Actions worker is serialized and protected by deployment secrets', () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /secrets\.LEONARDX_BASE_URL/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(workflow, /timeout-minutes: 6/);
  assert.match(workflow, /cancel-in-progress: false/);
});
