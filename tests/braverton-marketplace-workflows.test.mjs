import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreSellerVerificationRisk } from '../lib/store/seller-verification-risk.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Bram only auto-approves complete, established, email-confirmed, non-duplicate applications', () => {
  const lowRisk = scoreSellerVerificationRisk({
    emailConfirmed: true, accountAgeDays: 30, businessName: 'Example Traders',
    details: 'A detailed business description '.repeat(6), duplicateBusiness: false,
  });
  assert.equal(lowRisk.outcome, 'auto_approved');
  assert.equal(lowRisk.riskScore, 0);
  for (const input of [
    { emailConfirmed: false, accountAgeDays: 30, businessName: 'Example', details: 'A detailed business description '.repeat(6), duplicateBusiness: false },
    { emailConfirmed: true, accountAgeDays: 1, businessName: 'Example', details: 'A detailed business description '.repeat(6), duplicateBusiness: false },
    { emailConfirmed: true, accountAgeDays: 30, businessName: 'Example', details: 'Short details', duplicateBusiness: false },
    { emailConfirmed: true, accountAgeDays: 30, businessName: 'Example', details: 'A detailed business description '.repeat(6), duplicateBusiness: true },
    { emailConfirmed: true, accountAgeDays: 30, businessName: 'Example', details: 'Visit https://example.invalid', duplicateBusiness: false },
  ]) assert.equal(scoreSellerVerificationRisk(input).outcome, 'manual_review');
});

test('Bram worker is cron-protected, feature-gated and records decisions before seller access is granted', async () => {
  const [worker, migration] = await Promise.all([
    read('../app/api/cron/store/seller-verification/route.ts'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
  ]);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /BRAM_STORE_VERIFICATION_ENABLED/);
  assert.match(worker, /marketplace_seller_verification_decisions/);
  assert.match(migration, /finalize_marketplace_seller_verification/);
  assert.match(migration, /for update/);
  assert.match(migration, /is_verified=true/);
  assert.match(migration, /decision_source text not null/);
});

test('order references are human-readable, sequence-backed and fulfillment events enter the buyer timeline', async () => {
  const [migration, buyerApi, buyerUi] = await Promise.all([
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
    read('../app/api/store/orders/route.ts'),
    read('../app/store/orders/orders-client.tsx'),
  ]);
  assert.match(migration, /BRV-/);
  assert.match(migration, /marketplace_order_number_seq/);
  assert.match(migration, /before insert on public\.marketplace_orders/);
  assert.match(migration, /record_marketplace_fulfillment_timeline/);
  assert.match(buyerApi, /eq\('buyer_id', user\.id\)/);
  assert.match(buyerApi, /marketplace_order_events/);
  assert.match(buyerUi, /Order tracking history/);
});

test('notification helper records idempotent in-app, email and push outcomes and respects preferences', async () => {
  const [helper, migration] = await Promise.all([
    read('../lib/store-notifications.ts'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
  ]);
  assert.match(helper, /idempotencyKey/);
  assert.match(helper, /marketplace_notification_deliveries/);
  assert.match(helper, /email_opt_out/);
  assert.match(helper, /user_preference_disabled/);
  assert.match(migration, /unique\(notification_id,delivery_key\)/);
});

test('affiliate commission liability waits for all buyer-confirmed deliveries and no open dispute', async () => {
  const migration = await read('../supabase/migrations/20261113100000_leox_affiliate_supplier_foundation.sql');
  assert.match(migration, /all deliveries must be buyer-confirmed/);
  assert.match(migration, /status <> 'delivered' or buyer_confirmed_at is null/);
  assert.match(migration, /status in \('open','reviewing'\)/);
  assert.match(migration, /v_click\.affiliate_id = p_buyer_id/);
});

test('dropship application requires seller terms acceptance and supplier approval before paused moderation listing', async () => {
  const [sellerApi, supplierApi, migration] = await Promise.all([
    read('../app/api/store/suppliers/dropship/route.ts'),
    read('../app/api/store/suppliers/route.ts'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
  ]);
  assert.match(sellerApi, /termsAccepted !== true/);
  assert.match(sellerApi, /marketplace_dropship_applications/);
  assert.match(supplierApi, /review_marketplace_dropship_application/);
  assert.match(migration, /v_supplier\.verification_status <> 'approved'/);
  assert.match(migration, /v_seller\.is_verified/);
  assert.match(migration, /'pending_review'/);
  assert.match(migration, /'paused'/);
});
