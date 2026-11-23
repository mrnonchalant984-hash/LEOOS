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
    { emailConfirmed: true, accountAgeDays: 30, businessName: 'Example', details: 'A detailed business description '.repeat(6), duplicateBusiness: false, evidenceUrl: 'https://example.invalid/business' },
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
  assert.match(migration, /gen_random_uuid\(\)/);
  assert.match(migration, /before insert on public\.marketplace_orders/);
  assert.match(migration, /record_marketplace_fulfillment_timeline/);
  assert.match(buyerApi, /eq\('buyer_id', user\.id\)/);
  assert.match(buyerApi, /marketplace_order_events/);
  assert.match(buyerUi, /Order tracking history/);
});

test('notification helper records idempotent in-app, email and push outcomes and respects preferences', async () => {
  const [helper, migration, retryWorker] = await Promise.all([
    read('../lib/store-notifications.ts'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
    read('../app/api/cron/store/notification-retries/route.ts'),
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
  assert.match(migration, /marketplace_dropship_application_events/);
  assert.match(migration, /application_submitted/);
  assert.match(migration, /listing_status_changed/);
  assert.match(migration, /sync_braverton_dropship_listing_moderation/);
  assert.match(migration, /sync_braverton_supplier_verification_to_listings/);
});

test('owner can override escalated seller decisions only through the audited two-factor-protected RPC', async () => {
  const [api, migration] = await Promise.all([
    read('../app/api/admin/store/seller-verification/route.ts'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
  ]);
  assert.match(api, /requireOwner\(request\)/);
  assert.match(api, /owner_review_marketplace_seller_verification/);
  assert.match(migration, /role='owner' and twofa_verified=true/);
  assert.match(migration, /decision_source,outcome/);
  assert.match(migration, /'owner_approved'/);
});

test('payment and fulfilment events send deduplicated buyer, seller and affiliate notifications', async () => {
  const [webhook, supplierFulfillment, buyerOrders] = await Promise.all([
    read('../app/api/payment/webhook/route.ts'),
    read('../app/api/store/suppliers/fulfillment/route.ts'),
    read('../app/api/store/orders/route.ts'),
  ]);
  assert.match(webhook, /order:.*payment-confirmed:buyer/);
  assert.match(webhook, /payment-confirmed:seller/);
  assert.match(webhook, /affiliate-payout:/);
  assert.match(supplierFulfillment, /supplier-fulfillment:/);
  assert.match(buyerOrders, /cancellation-request:/);
});

test('backup workflow encrypts database and Storage archives and restore is staging-only', async () => {
  const [workflow, backup, restore, runbook] = await Promise.all([
    read('../.github/workflows/braverton-market-backup.yml'),
    read('../scripts/braverton-backup.sh'),
    read('../scripts/braverton-restore-staging.sh'),
    read('../docs/BRAVERTON_MARKET_BACKUP_RUNBOOK.md'),
  ]);
  assert.match(workflow, /schedule:/);
  assert.match(backup, /pg_dump/);
  assert.match(backup, /aws .* s3 sync/);
  assert.match(backup, /age --recipient/);
  assert.match(backup, /pg_restore --list/);
  assert.match(backup, /remote_checksum/);
  assert.match(restore, /RESTORE_TARGET_ENV.*staging/);
  assert.match(restore, /pg_restore/);
  assert.match(runbook, /not operationally verified/);
});

test('buyer checkout and marketplace partner applications require a confirmed account email', async () => {
  const [checkout, affiliate, supplier] = await Promise.all([
    read('../app/api/store/checkout/route.ts'),
    read('../app/api/store/affiliates/route.ts'),
    read('../app/api/store/suppliers/route.ts'),
  ]);
  assert.match(checkout, /user\.email_confirmed_at/);
  assert.match(affiliate, /user\.email_confirmed_at/);
  assert.match(supplier, /user\.email_confirmed_at/);
});

test('seller verification evidence is HTTPS-only, human-reviewed and visible to owner reviewers', async () => {
  const [submission, worker, ownerPage, migration] = await Promise.all([
    read('../app/api/store/seller/verification/route.ts'),
    read('../app/api/cron/store/seller-verification/route.ts'),
    read('../app/admin/store/seller-verification/page.tsx'),
    read('../supabase/migrations/20261123160000_braverton_market_launch_hardening.sql'),
  ]);
  assert.match(submission, /evidenceUrl/);
  assert.match(submission, /\^https:/);
  assert.match(worker, /evidenceUrl: item\.evidence_url/);
  assert.match(ownerPage, /Open submitted business evidence/);
  assert.match(migration, /marketplace_seller_verification_evidence_url_check/);
});

test('affiliate commission release runs through a CRON_SECRET-protected scheduled worker', async () => {
  const [worker, config, operations] = await Promise.all([
    read('../app/api/cron/store/affiliate-commission-release/route.ts'),
    read('../vercel.json'),
    read('../.github/workflows/braverton-market-operations.yml'),
  ]);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /release_eligible_marketplace_affiliate_commissions/);
  assert.match(worker, /affiliate-commission:.*eligible/);
  assert.match(operations, /affiliate-commission-release/);
  assert.match(operations, /notification-retries/);
  assert.match(operations, /CRON_SECRET/);
  assert.deepEqual(JSON.parse(config).crons.map(item => item.schedule), ['0 9 * * *','0 10 * * *','0 11 * * *','0 12 * * *','0 13 * * *','0 14 * * *']);
});

test('marketplace landing shows all active seller categories by default and filters by stored category', async () => {
  const page = await read('../app/store/page.tsx');
  assert.match(page, /categoryRows/);
  assert.match(page, /\.eq\('status', 'active'\)/);
  assert.match(page, /if \(category\) query = query\.eq\('category', category\)/);
  assert.match(page, /href="\/store"/);
});

test('owner can inspect notification delivery evidence without exposing delivery logs publicly', async () => {
  const [api, page] = await Promise.all([
    read('../app/api/admin/store/notification-deliveries/route.ts'),
    read('../app/admin/store/notification-deliveries/page.tsx'),
  ]);
  assert.match(api, /requireOwner\(request\)/);
  assert.match(api, /marketplace_notification_deliveries/);
  assert.match(page, /Notification delivery evidence/);
  assert.match(page, /attempts/);
});

test('affiliate withdrawal requests and owner decisions notify the affiliate without bypassing payout gates', async () => {
  const [requestApi, ownerApi] = await Promise.all([
    read('../app/api/store/affiliates/payout-requests/route.ts'),
    read('../app/api/admin/store/affiliates/payouts/route.ts'),
  ]);
  assert.match(requestApi, /affiliate-payout-request:/);
  assert.match(ownerApi, /requireOwner\(request\)/);
  assert.match(ownerApi, /AFFILIATE_PAYOUTS_ENABLED/);
  assert.match(ownerApi, /Braverton affiliate commission/);
  assert.match(ownerApi, /affiliate-payout:/);
});

test('new message and supplier application decisions use deterministic notification keys', async () => {
  const [messages, reseller, supplier] = await Promise.all([
    read('../app/api/store/conversations/[id]/messages/route.ts'),
    read('../app/api/store/suppliers/dropship/route.ts'),
    read('../app/api/store/suppliers/route.ts'),
  ]);
  assert.match(messages, /idempotencyKey: `message:/);
  assert.match(reseller, /dropship-application:.*submitted/);
  assert.match(supplier, /dropship-application:.*String\(body\.decision\)/);
});

test('backup runbook covers key custody, live marketplace buckets and staging-only recovery', async () => {
  const runbook = await read('../docs/BRAVERTON_MARKET_BACKUP_RUNBOOK.md');
  assert.match(runbook, /age-keygen/);
  assert.match(runbook, /marketplace-products marketplace-private/);
  assert.match(runbook, /RESTORE_TARGET_ENV=staging/);
  assert.match(runbook, /not operationally verified|not a backup/i);
});
