import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProductPrice, productSlug, validateProductInput } from '../lib/store/products.ts';

const validInput = {
  title: 'Refurbished laptop',
  description: 'Lightly used laptop with charger and original box.',
  category: 'Computers',
  price: 250000,
  currency: 'NGN',
  condition: 'refurbished',
  countryCode: 'NG',
  region: '',
  city: 'Lagos',
};

test('accepts valid listing details without currency conversion', () => {
  const result = validateProductInput(validInput);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value.price, 250000);
    assert.equal(result.value.currency, 'NGN');
    assert.equal(result.value.region, '');
  }
});

test('rejects unsupported categories, conditions, currencies, and nonpositive prices', () => {
  for (const change of [
    { category: 'unapproved category' },
    { condition: 'like new' },
    { currency: 'NG' },
    { price: 0 },
    { price: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(validateProductInput({ ...validInput, ...change }).valid, false);
  }
});

test('rejects malformed shapes, oversized descriptions, and control characters', () => {
  assert.equal(validateProductInput(null).valid, false);
  assert.equal(validateProductInput({ ...validInput, description: 'x'.repeat(5001) }).valid, false);
  assert.equal(validateProductInput({ ...validInput, title: 'Safe\u0000name' }).valid, false);
});

test('creates URL-safe slugs with a collision suffix', () => {
  assert.equal(productSlug('Café & Phones', '12345678-aaaa-bbbb-cccc'), 'cafe-phones-12345678aa');
});

test('formats the advertised currency without substituting another currency', () => {
  assert.match(formatProductPrice(250000, 'NGN'), /NGN/);
  assert.match(formatProductPrice(100, 'KES'), /KES/);
});
