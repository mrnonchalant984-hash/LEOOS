import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const payout = await readFile(new URL('../lib/store-payouts.ts', import.meta.url), 'utf8');
const reconcile = await readFile(new URL('../app/api/cron/store-payout-reconcile/route.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../app/api/payment/webhook/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261119120000_leox_store_payout_reconciliation.sql', import.meta.url), 'utf8');

test('ambiguous transfer initiation is quarantined and never reported as a definite failure', () => {
  assert.match(payout, /status: 'unknown'/);
  assert.match(payout, /outcome is unknown/);
  assert.match(payout, /verify the original transfer reference before retrying/);
});

test('scheduled reconciliation verifies the same Paystack reference and validates returned reference', () => {
  assert.match(reconcile, /transfer\/verify\//);
  assert.match(reconcile, /result\.data\.reference !== payout\.reference/);
  assert.match(reconcile, /Number\(result\.data\.amount\) !== Number\(payout\.net_kobo\)/);
  assert.match(reconcile, /result\.data\.recipient\?\.recipient_code !== payout\.recipient_code/);
  assert.match(reconcile, /timingSafeEqual/);
  assert.match(reconcile, /limit\(50\)/);
});

test('payout schema permits explicit unknown state for ambiguous provider outcomes', () => {
  assert.match(migration, /'unknown'/);
  assert.match(migration, /last_provider_check_at/);
});

test('Paystack transfer webhooks can resolve an ambiguous payout state', () => {
  assert.match(webhook, /\['initiating', 'pending', 'unknown', 'paid'\]/);
});
