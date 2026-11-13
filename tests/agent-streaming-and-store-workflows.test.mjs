import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const stream = await readFile(new URL('../app/api/agents/run/stream/route.ts', import.meta.url), 'utf8');
const manager = await readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
const agentsUi = await readFile(new URL('../app/agents/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261113100000_leox_affiliate_supplier_foundation.sql', import.meta.url), 'utf8');
const checkout = await readFile(new URL('../app/api/store/checkout/route.ts', import.meta.url), 'utf8');
const orders = await readFile(new URL('../app/api/store/orders/route.ts', import.meta.url), 'utf8');

test('agent execution exposes durable SSE status and execution events', () => {
  assert.match(stream, /text\/event-stream/);
  assert.match(stream, /agent_execution_events/);
  assert.match(stream, /waiting_approval/);
  assert.match(manager, /tool_started/);
  assert.match(manager, /tool_completed/);
  assert.match(manager, /tool_failed/);
  assert.match(agentsUi, /\/api\/agents\/run\/stream/);
});

test('affiliate attribution is attached to checkout orders and commission waits for confirmed delivery', () => {
  assert.match(checkout, /attribute_marketplace_order/);
  assert.match(migration, /clicked_at >= now\(\) - interval '30 days'/);
  assert.match(migration, /affiliate_id <> buyer_id/);
  assert.match(migration, /buyer_confirmed_at is null/);
  assert.match(orders, /prepare_marketplace_affiliate_commission/);
});

test('supplier fulfillment is created after payment and supplier stock is synchronized', () => {
  assert.match(migration, /enqueue_marketplace_supplier_fulfillment/);
  assert.match(migration, /after update of status on public\.marketplace_orders/);
  assert.match(migration, /sync_marketplace_dropship_stock/);
  assert.match(migration, /update_marketplace_supplier_fulfillment/);
  assert.match(migration, /sync_supplier_verification_to_dropship/);
});

test('commerce administration is owner-gated and exposes provider settlement without claiming escrow', async () => {
  const adminRoute = await readFile(new URL('../app/api/admin/store/commerce/route.ts', import.meta.url), 'utf8');
  const settlement = await readFile(new URL('../lib/store/settlement-provider.ts', import.meta.url), 'utf8');
  const adminPage = await readFile(new URL('../app/admin/store/commerce/page.tsx', import.meta.url), 'utf8');
  assert.match(adminRoute, /requireOwner\(request\)/);
  assert.match(adminRoute, /getStoreSettlementStatus/);
  assert.match(settlement, /escrow: false/);
  assert.match(settlement, /providerManagedSplit: enabled && process\.env\.STORE_PAYSTACK_SPLIT_ENABLED === 'true'/);
  assert.match(adminPage, /Commerce administration/);
});

test('affiliate and supplier dashboards and owner review routes are present', async () => {
  const affiliatePage = await readFile(new URL('../app/store/affiliates/page.tsx', import.meta.url), 'utf8');
  const supplierPage = await readFile(new URL('../app/store/suppliers/page.tsx', import.meta.url), 'utf8');
  const affiliateAdmin = await readFile(new URL('../app/api/admin/store/affiliates/route.ts', import.meta.url), 'utf8');
  const supplierAdmin = await readFile(new URL('../app/api/admin/store/suppliers/route.ts', import.meta.url), 'utf8');
  assert.match(affiliatePage, /Affiliate dashboard/);
  assert.match(supplierPage, /Supplier dashboard/);
  assert.match(affiliateAdmin, /requireOwner\(request\)/);
  assert.match(supplierAdmin, /requireOwner\(request\)/);
});
