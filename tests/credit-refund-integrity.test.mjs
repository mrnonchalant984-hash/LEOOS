import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('forward credit migration binds refunds to the exact reservation and prevents idempotency cost changes', async () => {
  const migration = await read('supabase/migrations/20261027130000_credit_reservation_refund_integrity.sql');
  assert.match(migration, /idempotency_key = \('reserve:' \|\| p_job_id::text\)/);
  assert.match(migration, /existing\.amount <> -p_cost/);
  assert.match(migration, /Matching credit reservation not found/);
  assert.match(migration, /Refund amount does not match reserved credits/);
  assert.match(migration, /idempotency_key = \('refund:' \|\| p_job_id::text\)/);
  assert.match(migration, /prior_refund\.amount <> p_cost/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on function public\.refund_platform_credits/i);
  assert.match(migration, /grant execute on function public\.refund_platform_credits.*to service_role/i);
});
