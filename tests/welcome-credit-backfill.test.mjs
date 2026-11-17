import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('welcome credit repair is one-time, ledger-backed and excludes owners', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261116120000_repair_missing_welcome_credits.sql', import.meta.url), 'utf8');
  assert.match(sql, /coalesce\(lower\(p\.role\), 'user'\) <> 'owner'/i);
  assert.match(sql, /a\.balance = 0 and a\.total_granted = 0/i);
  assert.match(sql, /idempotency_key = 'welcome-bonus-v1'/i);
  assert.match(sql, /balance = balance \+ 50/i);
  assert.match(sql, /total_granted = total_granted \+ 50/i);
  assert.match(sql, /event_type, source, idempotency_key, balance_after/i);
  assert.match(sql, /on conflict \(user_id, idempotency_key\) do nothing/i);
});
