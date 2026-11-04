import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInvitationCode,
  hashInvitationCode,
  normalizeInvitationCode,
  validateInvitationBatch,
} from '../lib/leocode-access.ts';
import { DONATION_MAX_KOBO, DONATION_MIN_KOBO, parseDonationAmount } from '../lib/donation-input.ts';

test('invitation codes are high-entropy, normalized, and persisted as a one-way hash', () => {
  const { code, codeHash } = createInvitationCode();
  assert.match(code, /^LEOCODE-EARLY-[A-F0-9]{16}$/);
  assert.equal(codeHash, hashInvitationCode(code));
  assert.notEqual(codeHash, code);
  assert.equal(normalizeInvitationCode(` ${code.toLowerCase()} `), code);
  assert.equal(normalizeInvitationCode('LEOCODE-EARLY-1234'), null);
});

test('invitation batches are bounded and require a future expiry', () => {
  const valid = validateInvitationBatch({
    count: 100,
    maxRedemptions: 1000,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(valid.count, 100);
  assert.equal(valid.maxRedemptions, 1000);
  assert.equal(validateInvitationBatch({ count: 101, maxRedemptions: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() }), null);
  assert.equal(validateInvitationBatch({ count: 1, maxRedemptions: 1, expiresAt: new Date(0).toISOString() }), null);
});

test('donations accept whole-naira amounts only within the configured bounds', () => {
  assert.equal(DONATION_MIN_KOBO, 10_000);
  assert.equal(DONATION_MAX_KOBO, 500_000_000);
  assert.equal(parseDonationAmount(100), 10_000);
  assert.equal(parseDonationAmount('5000000'), 500_000_000);
  assert.equal(parseDonationAmount(99), null);
  assert.equal(parseDonationAmount(5_000_001), null);
  assert.equal(parseDonationAmount(100.5), null);
  assert.equal(parseDonationAmount('0x64'), null);
  assert.equal(parseDonationAmount('not-an-amount'), null);
});
