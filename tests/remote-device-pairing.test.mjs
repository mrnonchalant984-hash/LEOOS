import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('remote pairing stores only hashed one-time codes and limits pairing attempts', () => {
  const route = read('../app/api/remote/pairings/route.ts');
  const claim = read('../app/api/remote/pairings/claim/route.ts');
  assert.match(route, /randomBytes\(5\)/);
  assert.match(route, /pairing_code_hash: hash\(code\)/);
  assert.match(route, /expires_at: new Date\(Date\.now\(\) \+ 5 \* 60_000\)/);
  assert.match(route, /remote-pairing-create/);
  assert.match(claim, /remote-pairing-claim/);
  assert.match(claim, /pairing\.user_id !== ctx\.user\.id/);
  assert.match(claim, /\.eq\('status', 'pending'\)\.gt\('expires_at'/);
});

test('remote event relay requires authenticated paired owner, validates payloads, and supports SSE', () => {
  const route = read('../app/api/remote/sessions/[sessionId]/events/route.ts');
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(route, /data\.status !== 'paired'/);
  assert.match(route, /12_000/);
  assert.match(route, /text\.length > 4000/);
  assert.match(route, /eventType === 'chat\.open'/);
  assert.match(route, /payload\.sessionId/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /currentPairing\?\.status !== 'paired'/);
});

test('remote pairing migration locks direct client access behind server-side authorization', () => {
  const migration = read('../supabase/migrations/20261013180000_remote_device_pairing.sql');
  assert.match(migration, /create table if not exists public\.leo_remote_pairings/);
  assert.match(migration, /create table if not exists public\.leo_remote_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.leo_remote_pairings from anon, authenticated/);
  assert.match(migration, /revoke all on public\.leo_remote_events from anon, authenticated/);
});
