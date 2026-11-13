import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261113130000_leox_supplier_dispatch_split_and_affiliate_payouts.sql', import.meta.url), 'utf8');
const checkout = await readFile(new URL('../app/api/store/checkout/route.ts', import.meta.url), 'utf8');
const payoutAccount = await readFile(new URL('../app/api/store/seller/payout-account/route.ts', import.meta.url), 'utf8');
const affiliateRequests = await readFile(new URL('../app/api/store/affiliates/payout-requests/route.ts', import.meta.url), 'utf8');
const affiliatePayout = await readFile(new URL('../app/api/admin/store/affiliates/payouts/route.ts', import.meta.url), 'utf8');
const connector = await readFile(new URL('../lib/store/supplier-connectors.ts', import.meta.url), 'utf8');
const dispatchWorker = await readFile(new URL('../app/api/cron/store/supplier-dispatch/route.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../app/api/payment/webhook/route.ts', import.meta.url), 'utf8');

test('Paystack seller multi-split is feature-gated and uses verified seller subaccounts', () => {
  assert.match(payoutAccount, /api\.paystack\.co\/subaccount/);
  assert.match(payoutAccount, /subaccount_code/);
  assert.match(checkout, /STORE_PAYSTACK_SPLIT_ENABLED === 'true'/);
  assert.match(checkout, /type: 'flat', bearer_type: 'account', subaccounts/);
  assert.match(checkout, /marketplace_order_items/);
});

test('affiliate cash-out requires eligible commission, saved recipient, and owner-approved request', () => {
  assert.match(migration, /marketplace_affiliate_payout_requests/);
  assert.match(migration, /v_request\.status <> 'approved'/);
  assert.match(affiliateRequests, /commission\.status!=='eligible'/);
  assert.match(affiliateRequests, /marketplace_affiliate_payout_accounts/);
  assert.match(affiliatePayout, /requireOwner/);
  assert.match(affiliatePayout, /AFFILIATE_PAYOUTS_ENABLED!=='true'/);
  assert.match(affiliatePayout, /api\.paystack\.co\/transfer/);
  assert.match(affiliatePayout, /transfer\/verify/);
});

test('supplier connector uses explicit HTTPS host allowlist, bearer secret, and idempotency key', () => {
  assert.match(connector, /STORE_SUPPLIER_CONNECTOR_ALLOWED_HOSTS/);
  assert.match(connector, /endpoint\.protocol !== 'https:'/);
  assert.match(connector, /Idempotency-Key/);
  assert.match(connector, /Authorization: `Bearer \$\{connector\.token\}`/);
  assert.match(dispatchWorker, /CRON_SECRET/);
  assert.match(dispatchWorker, /leox-supplier-\$\{job\.id\}/);
  assert.match(migration, /marketplace_supplier_dispatch_events/);
});

test('successful marketplace payment triggers best-effort external supplier dispatch', () => {
  assert.match(webhook, /dispatchSupplierFulfillment/);
  assert.match(webhook, /apply_marketplace_payment/);
  assert.match(webhook, /supplier_dispatch/);
  assert.match(webhook, /affiliatePayout/);
  assert.match(webhook, /transfer\.reversed/);
});
