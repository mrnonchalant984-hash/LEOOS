import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Bram source review accepts web and backend language files and bounded project archives', async () => {
  const route = await readFile(new URL('../app/api/file-review/route.ts', import.meta.url), 'utf8');
  for (const language of ['py','js','jsx','ts','tsx','go','rs','java','php','sql','yaml','toml','vue','svelte']) assert.match(route, new RegExp(language));
  assert.match(route, /10 \* 1024 \* 1024/);
  assert.match(route, /SOURCE FILE:/);
  assert.match(route, /180_000/);
  assert.match(route, /node_modules/);
});

test('Bram reminders persist per user, enforce RLS, and expose lease-based delivery retries', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261119140000_bram_productivity_reliability.sql', import.meta.url), 'utf8');
  const api = await readFile(new URL('../app/api/bram/reminders/route.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../app/api/cron/bram-productivity/route.ts', import.meta.url), 'utf8');
  for (const token of ['bram_reminders','bram_reminder_deliveries','enable row level security','auth.uid()','claim_due_bram_reminders','for update skip locked','service_role']) assert.ok(migration.toLowerCase().includes(token.toLowerCase()), `missing ${token}`);
  assert.match(api, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /retry_scheduled/);
  assert.match(worker, /onConflict: 'reminder_id,scheduled_for,channel'/);
  assert.match(worker, /nextOccurrence/);
});

test('Bram calendar APIs and tools are account-scoped with explicit write intent', async () => {
  const api = await readFile(new URL('../app/api/bram/calendar/route.ts', import.meta.url), 'utf8');
  const tools = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
  const manager = await readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  assert.match(api, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(tools, /bram_calendar_list_events/);
  assert.match(tools, /bram_calendar_create_event/);
  assert.match(tools, /bram_calendar_update_event/);
  assert.match(tools, /bram_calendar_delete_event/);
  assert.match(manager, /permissions\.has\('calendar_write'\)/);
});

test('Workflow scheduler supports daily and weekly timezone-aware schedules and bounded queue claims', async () => {
  const createRoute = await readFile(new URL('../app/api/workflows/route.ts', import.meta.url), 'utf8');
  const updateRoute = await readFile(new URL('../app/api/workflows/[id]/route.ts', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../lib/workflow-schedule.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../app/api/internal/workflow-worker/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261119140000_bram_productivity_reliability.sql', import.meta.url), 'utf8');
  assert.match(createRoute, /'daily', 'weekly'/);
  assert.match(updateRoute, /'daily','weekly'/);
  assert.match(helper, /Intl\.DateTimeFormat/);
  assert.match(helper, /nextWorkflowRunAt/);
  assert.match(migration, /trigger_config->>'type' in \('interval','daily','weekly'\)/);
  assert.match(worker, /Math\.min\(5, request\.limit\)/);
  assert.match(worker, /status: 'cancelled', lease_owner: null/);
  assert.match(worker, /workflow_action_unverified/);
  assert.match(worker, /workflow_tool_execution_failed/);
});
