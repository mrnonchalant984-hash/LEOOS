import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261113100000_leox_affiliate_supplier_foundation.sql', import.meta.url), 'utf8');
const checkout = await readFile(new URL('../app/api/store/checkout/route.ts', import.meta.url), 'utf8');
const orders = await readFile(new URL('../app/api/store/orders/route.ts', import.meta.url), 'utf8');

test('affiliate and supplier foundations are additive and service-role protected', () => {
  for (const table of ['marketplace_affiliates','marketplace_affiliate_clicks','marketplace_order_attributions','marketplace_affiliate_commissions','marketplace_suppliers','marketplace_supplier_products','marketplace_dropship_listings','marketplace_supplier_fulfillment_requests']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});

test('affiliate attribution rejects self-referrals and uses a bounded 30-day click window', () => {
  assert.match(migration, /c\.clicked_at >= now\(\) - interval '30 days'/);
  assert.match(migration, /v_click\.affiliate_id = p_buyer_id/);
  assert.match(migration, /on conflict \(order_id\) do nothing/);
});

test('affiliate commission is a non-custodial liability created only after buyer-confirmed delivery and dispute checks', () => {
  assert.match(migration, /status <> 'delivered' or buyer_confirmed_at is null/);
  assert.match(migration, /status in \('open','reviewing'\)/);
  assert.match(migration, /now\(\) \+ interval '7 days'/);
  assert.match(migration, /does not transfer funds/i);
});

test('existing checkout and Orders routes remain present and unchanged in their core responsibilities', () => {
  assert.match(checkout, /create_marketplace_order/);
  assert.match(checkout, /api\.paystack\.co\/transaction\/initialize/);
  assert.match(orders, /from\('marketplace_orders'\)/);
  assert.match(orders, /buyer_confirmed_at/);
});
