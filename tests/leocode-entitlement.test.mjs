import test from 'node:test';
import assert from 'node:assert/strict';
import { LEOCODE_DAILY_REQUEST_LIMIT, LEOCODE_DAILY_WINDOW_SECONDS } from '../lib/leocode-entitlement-config.ts';

test('Founders LeoCode requests have an explicit rolling 24-hour server limit', () => {
  assert.equal(LEOCODE_DAILY_REQUEST_LIMIT, 40);
  assert.equal(LEOCODE_DAILY_WINDOW_SECONDS, 86_400);
});
