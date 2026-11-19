import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(root, path), 'utf8');

test('LeoX Store signup offers separate buyer and seller destinations', () => {
  const authForm = source('components/AuthForm.tsx');
  const signupRoute = source('app/api/auth/signup/route.ts');
  const joinPage = source('app/store/join/page.tsx');
  assert.match(authForm, /store_account_type/);
  assert.match(authForm, /storeDestination\(storeAccountType\)/);
  assert.match(signupRoute, /!\['buyer', 'seller'\]\.includes\(store_account_type\)/);
  assert.match(signupRoute, /store_account_type/);
  assert.match(joinPage, /signupHref\('buyer'\)/);
  assert.match(joinPage, /signupHref\('seller'\)/);
});

test('Store navigation and account pages keep buyer and seller workspaces distinct', () => {
  const navigation = source('components/StoreChrome.tsx');
  const buyerPage = source('app/store/account/page.tsx');
  const sellerPage = source('app/store/seller/seller-dashboard.tsx');
  assert.match(navigation, /href="\/store\/account"[^>]*>Buyer account/);
  assert.match(navigation, /href="\/store\/seller"[^>]*>Seller dashboard/);
  assert.match(buyerPage, /Buyer workspace/);
  assert.match(sellerPage, /Seller workspace/);
  assert.match(sellerPage, /SellerVerificationPanel/);
});

test('listing, image, delivery, and checkout operations require verified sellers', () => {
  const gate = source('lib/store/seller-access.ts');
  assert.match(gate, /is_verified/);
  for (const path of [
    'app/api/store/products/route.ts',
    'app/api/store/images/route.ts',
    'app/api/store/seller/products/[id]/route.ts',
    'app/api/store/seller/delivery/route.ts',
    'app/api/store/seller/delivery/[id]/route.ts',
  ]) {
    assert.match(source(path), /requireVerifiedStoreSeller/);
  }
  assert.match(source('app/api/store/checkout/route.ts'), /eq\('is_verified', true\)/);
});

test('unverified listings are excluded from public discovery and seller approval enables access', () => {
  assert.match(source('app/api/store/products/route.ts'), /getVerifiedStoreSellerIds/);
  assert.match(source('app/store/page.tsx'), /getVerifiedStoreSellerIds/);
  const productPage = source('app/store/product/[slug]/page.tsx');
  assert.match(productPage, /if \(!seller\?\.is_verified\) return null/);
  assert.match(productPage, /data\.seller_id === viewerId/);
  assert.match(productPage, /Seller-only listing preview/);
  assert.match(source('app/store/seller/[id]/page.tsx'), /!seller\?\.is_verified/);
  assert.match(source('app/api/admin/store/work-queue/route.ts'), /is_verified: true/);
});

test('seller verification is rate-limited and reports pending or rejected status', () => {
  const verificationApi = source('app/api/store/seller/verification/route.ts');
  const verificationPanel = source('app/store/seller/seller-verification-panel.tsx');
  assert.match(verificationApi, /enforceUserRateLimit/);
  assert.match(verificationApi, /status', 'pending'/);
  assert.match(verificationPanel, /Request under review/);
  assert.match(verificationPanel, /request\?\.status === 'rejected'/);
  assert.match(verificationPanel, /Do not send identity documents/);
});

test('checkout charges one seller-configured delivery option and requires seller payout setup', () => {
  const checkout = source('app/api/store/checkout/route.ts');
  const cart = source('app/store/cart/cart-client.tsx');
  const migration = source('supabase/migrations/20261112100000_leox_store_delivery_payout_push.sql');
  assert.match(checkout, /p_delivery_options/);
  assert.match(checkout, /marketplace_seller_payout_accounts/);
  assert.match(cart, /deliveryOptions/);
  assert.match(cart, /Continue to secure payment/);
  assert.match(migration, /marketplace_order_deliveries/);
  assert.match(migration, /v_delivery_total/);
});

test('seller commission is 5 percent and payout waits for buyer-confirmed delivery', () => {
  const migration = source('supabase/migrations/20261112100000_leox_store_delivery_payout_push.sql');
  const accountApi = source('app/api/store/seller/payout-account/route.ts');
  const transferHelper = source('lib/store-payouts.ts');
  const buyerOrders = source('app/api/store/orders/route.ts');
  assert.match(migration, /commission_bps integer not null default 500 check \(commission_bps = 500\)/);
  assert.match(migration, /buyer_confirmed_at is not null/);
  assert.match(accountApi, /transferrecipient/);
  assert.match(transferHelper, /api\.paystack\.co\/transfer/);
  assert.match(buyerOrders, /prepare_marketplace_seller_payout/);
  assert.match(source('app/api/payment/webhook/route.ts'), /eventName === 'transfer\.reversed' \? \['initiating', 'pending', 'paid'\]/);
  assert.match(source('app/store/seller/seller-payout-settings.tsx'), /5% commission/);
});

test('seller can manage order tracking and buyer can confirm receipt', () => {
  const sellerUi = source('app/store/seller/orders/seller-orders-client.tsx');
  const sellerApi = source('app/api/store/seller/orders/route.ts');
  const buyerUi = source('app/store/orders/orders-client.tsx');
  assert.match(sellerUi, /trackingReference/);
  assert.match(sellerUi, /trackingUrl/);
  assert.match(source('app/store/seller/seller-dashboard.tsx'), /Manage orders/);
  assert.match(sellerApi, /marketplace_fulfillments/);
  assert.match(buyerUi, /Confirm I received this delivery/);
});

test('product images enforce a 2 MB input cap and support seller image removal', () => {
  const imageApi = source('app/api/store/images/route.ts');
  const productApi = source('app/api/store/seller/products/[id]/route.ts');
  const productUi = source('app/store/seller/products/page.tsx');
  assert.match(imageApi, /2 \* 1024 \* 1024/);
  assert.match(imageApi, /MAX_OPTIMIZED_BYTES/);
  assert.match(productApi, /storage\.from\('marketplace-products'\)\.remove/);
  assert.match(productUi, /keepImagePaths/);
  assert.match(productUi, /Uncheck images to remove them/);
});

test('web push is user-opt-in, VAPID-configured, and prunes expired subscriptions', () => {
  const subscriptionApi = source('app/api/store/push/route.ts');
  const notifications = source('lib/store-notifications.ts');
  const serviceWorker = source('public/store-push-sw.js');
  assert.match(subscriptionApi, /WEB_PUSH_PUBLIC_KEY/);
  assert.match(subscriptionApi, /marketplace_push_subscriptions/);
  assert.match(subscriptionApi, /isSupportedPushEndpoint/);
  assert.match(subscriptionApi, /updates\.push\.services\.mozilla\.com/);
  assert.match(source('app/store/push-notifications.tsx'), /Notification\.requestPermission/);
  assert.match(notifications, /webPush\.sendNotification/);
  assert.match(notifications, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(serviceWorker, /showNotification/);
});

test('seller payout preparation serializes against dispute creation and blocks open or reviewing disputes', () => {
  const migration = source('supabase/migrations/20261119110000_leox_store_payout_dispute_guard.sql');
  assert.match(migration, /before insert or update of order_id, status/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /status in \('open', 'reviewing'\)/i);
  assert.match(migration, /order has an open dispute/i);
  assert.match(migration, /status = 'initiating'[\s\S]*seller payout initiation already in progress/i);
  assert.match(migration, /select status[\s\S]*from public\.marketplace_orders[\s\S]*for update/i);
  assert.match(migration, /on conflict \(order_id, seller_id\) do nothing/i);
  assert.match(migration, /grant execute on function public\.prepare_marketplace_seller_payout\(uuid, uuid\) to service_role/i);
});

test('refund provider acceptance checks local state writes and webhook can reconcile cancellation_requested orders', () => {
  const refund = source('app/api/admin/store/orders/[id]/refund/route.ts');
  const webhook = source('app/api/payment/webhook/route.ts');
  assert.match(refund, /refundStateError/);
  assert.match(refund, /orderStateError/);
  assert.match(refund, /reconciliation_required: true/);
  assert.match(refund, /do not submit another refund/i);
  assert.match(webhook, /\.in\('status', \['refund_pending', 'cancellation_requested'\]\)/);
});

test('Paystack provider-managed seller splits pass each seller delivery fee through after item commission', () => {
  const checkout = source('app/api/store/checkout/route.ts');
  assert.match(checkout, /marketplace_order_deliveries/);
  assert.match(checkout, /deliveryBySeller/);
  assert.match(checkout, /gross - platformCommission \+ sellerDeliveryFee/);
  assert.match(checkout, /subaccounts\.reduce\(\(sum, item\) => sum \+ item\.share, 0\) > Number\(order\.total_kobo\)/);
});

test('checkout and payment confirmation enforce buyer ownership, amount, currency, metadata, and idempotent stock transitions', () => {
  const checkout = source('app/api/store/checkout/route.ts');
  const verify = source('app/api/store/orders/verify/route.ts');
  const migration = source('supabase/migrations/20261111120000_leox_store_buying.sql');
  assert.match(checkout, /STORE_CHECKOUT_ENABLED !== 'true'/);
  assert.match(checkout, /STORE_PAYOUTS_ENABLED !== 'true'/);
  assert.match(verify, /order\.buyer_id !== user\.id/);
  assert.match(verify, /Number\(tx\.amount\) !== Number\(order\.total_kobo\)/);
  assert.match(verify, /currency\)\.toUpperCase\(\) !== 'NGN'/);
  assert.match(verify, /metadata\.order_id !== order\.id/);
  assert.match(migration, /for update of p/);
  assert.match(migration, /p\.stock_quantity - p\.reserved_quantity < c\.quantity/);
  assert.match(migration, /if v_order\.status = 'paid' then return false/);
  assert.match(migration, /late_payment_review_required/);
});

test('Paystack webhook authenticates raw request body with timing-safe HMAC verification', () => {
  const webhook = source('app/api/payment/webhook/route.ts');
  assert.match(webhook, /x-paystack-signature/);
  assert.match(webhook, /createHmac\('sha512', secret\)\.update\(body\)/);
  assert.match(webhook, /timingSafeEqual\(expectedSignature, suppliedSignature\)/);
  assert.match(webhook, /verifyPaystackTransaction\(reference\)/);
});

test('seller verification, order ledgers, and payout tables do not grant client-side write privileges', () => {
  const commerce = source('supabase/migrations/20261111100000_leox_store_commerce.sql');
  const buying = source('supabase/migrations/20261111120000_leox_store_buying.sql');
  const payout = source('supabase/migrations/20261112100000_leox_store_delivery_payout_push.sql');
  assert.match(commerce, /grant select on public\.marketplace_sellers[\s\S]*to anon, authenticated/);
  assert.match(commerce, /revoke all on public\.marketplace_sellers[\s\S]*from public, anon, authenticated/);
  assert.match(buying, /grant select on public\.marketplace_orders, public\.marketplace_order_items, public\.marketplace_order_events, public\.marketplace_refunds to authenticated/);
  assert.match(buying, /grant all on public\.marketplace_cart_items, public\.marketplace_orders[\s\S]*to service_role/);
  assert.match(payout, /revoke all on public\.marketplace_order_deliveries, public\.marketplace_seller_payout_accounts[\s\S]*from public, anon, authenticated/);
  assert.match(payout, /grant all on public\.marketplace_order_deliveries, public\.marketplace_seller_payout_accounts[\s\S]*to service_role/);
});

test('uncertain Paystack transfer network outcomes stay non-retryable and reconcile as pending', () => {
  const transfer = source('lib/store-payouts.ts');
  assert.match(transfer, /catch \{[\s\S]*Transfer outcome is uncertain[\s\S]*status: 'pending'[\s\S]*eq\('status', 'initiating'\)/);
  assert.match(transfer, /Reconcile with Paystack before retrying/);
});
