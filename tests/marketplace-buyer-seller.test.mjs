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
