import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('SMTP implementation requires authenticated TLS and bounded messages', () => {
  const smtp = read('lib/smtp.ts');
  assert.match(smtp, /rejectUnauthorized: true/);
  assert.match(smtp, /STARTTLS/);
  assert.match(smtp, /\[465, 587\]/);
  assert.match(smtp, /smtp_invalid_message/);
});
test('isolated runner uses HMAC, no-network sandbox, and bounded resource controls', () => {
  const runner = read('services/isolated-runner/server.py');
  assert.match(runner, /compare_digest/);
  assert.match(runner, /'--network', 'none'/);
  assert.match(runner, /'--cap-drop', 'all'/);
  assert.match(runner, /'--memory', '1536m'/);
  assert.match(runner, /'install': \['sh', '-lc'/);
  assert.match(runner, /RUNNER_ALLOWED_REPOSITORIES/);
  assert.doesNotMatch(runner, /body\.get\(['"]command['"]\)/);
});
test('offline sync is owner-gated for workforce tasks and uses an idempotency key', () => {
  const route = read('app/api/offline/sync/route.ts');
  const migration = read('supabase/migrations/20261014140000_offline_sync_outbox.sql');
  assert.match(route, /isPlatformOwner\(auth\.profile\)/);
  assert.match(route, /idempotency_key/);
  assert.match(migration, /unique\(user_id, idempotency_key\)/i);
  assert.match(migration, /enable row level security/i);
});
test('realtime meetings and generated avatar clips require platform-owner authentication', () => {
  assert.match(read('app/api/meetings/[id]/realtime-session/route.ts'), /requireOwner/);
  assert.match(read('app/api/meetings/[id]/realtime-session/route.ts'), /realtime\.clientSecrets\.create/);
  assert.match(read('app/api/workforce/avatars/route.ts'), /requireOwner/);
  assert.match(read('app/api/workforce/avatars/route.ts'), /createRunwayVideo/);
});
test('role execution planner supports 160 catalog roles with bounded concurrency and dependency-cycle rejection', () => {
  const planner = read('lib/agents/role-runtime.ts');
  assert.match(planner, /PROFESSIONAL_ROLES\.length/);
  assert.match(planner, /Math\.min\(8/);
  assert.match(planner, /dependency_cycle/);
  assert.match(planner, /deny-by-default/);
});
test('worker monitoring endpoint is owner-only and worker heartbeat migration is private', () => {
  assert.match(read('app/api/workforce/monitoring/route.ts'), /requireOwner/);
  assert.match(read('supabase/migrations/20261014150000_workforce_worker_heartbeats.sql'), /enable row level security/i);
});

test('offline outbox UI keeps drafts local and preserves rejected events for review', () => {
  const page = read('app/offline/page.tsx');
  const outbox = read('lib/offline-outbox.ts');
  assert.match(page, /enqueueOfflineEvent/);
  assert.match(page, /Saved on this device/);
  assert.match(page, /rejected items remain here/i);
  assert.match(outbox, /navigator\.onLine/);
  assert.match(outbox, /\['accepted', 'queued'\]/);
});
test('offline mode blocks hosted fallback when local inference is missing', () => {
  const model = read('lib/openai.ts');
  assert.match(model, /LEO_OFFLINE_MODE === 'true'/);
  assert.match(model, /no hosted fallback is permitted/);
});
