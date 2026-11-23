import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const profile = await readFile(new URL('../app/api/store/seller/profile/route.ts', import.meta.url), 'utf8');
const storefront = await readFile(new URL('../app/store/seller/[id]/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261123150000_braverton_seller_storefront_contacts.sql', import.meta.url), 'utf8');
test('seller contact data is explicitly entered, validated and not copied from private account phone data', () => {
 assert.match(profile, /whatsappNumber/); assert.match(profile, /whatsapp_number: whatsappNumber/);
 assert.doesNotMatch(profile, /user\.phone|auth\.admin\.getUserById/);
 assert.match(migration, /marketplace_sellers_whatsapp_number_format/);
});
test('verified public storefront displays contact and clarifies delivery responsibility', () => {
 assert.match(storefront, /seller\.is_verified/); assert.match(storefront, /seller\.whatsapp_number/);
 assert.match(storefront, /https:\/\/wa\.me\//); assert.match(storefront, /not Braverton Market/);
});
