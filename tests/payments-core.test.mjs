import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesHostingRenewal } from '../lib/payments-core.ts';

const expected = {
  reference: 'hosting_renewal_test-1',
  hostingId: 'hosting-1',
  websiteProjectId: 'project-1',
  amountKobo: 1_500_000,
};

const transaction = {
  status: 'success',
  reference: expected.reference,
  amount: expected.amountKobo,
  currency: 'NGN',
  metadata: {
    type: 'hosting_renewal',
    hosting_id: expected.hostingId,
    website_project_id: expected.websiteProjectId,
  },
};

test('accepts a successful transaction matching the registered renewal intent', () => {
  assert.equal(matchesHostingRenewal(transaction, expected), true);
});

test('rejects non-success, mismatched references, amounts, currency, or metadata', () => {
  assert.equal(matchesHostingRenewal({ ...transaction, status: 'pending' }, expected), false);
  assert.equal(matchesHostingRenewal({ ...transaction, reference: 'other' }, expected), false);
  assert.equal(matchesHostingRenewal({ ...transaction, amount: expected.amountKobo + 1 }, expected), false);
  assert.equal(matchesHostingRenewal({ ...transaction, currency: 'USD' }, expected), false);
  assert.equal(matchesHostingRenewal({ ...transaction, metadata: { ...transaction.metadata, hosting_id: 'other' } }, expected), false);
  assert.equal(matchesHostingRenewal({ ...transaction, metadata: null }, expected), false);
});
