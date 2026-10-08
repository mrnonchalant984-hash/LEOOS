import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureHeader, verifySignature, nextAttemptDelaySec, validateEndpointUrl, isPrivateIp, parseEvents, generateWebhookSecret, MAX_ATTEMPTS } from '../lib/webhooks-core.ts';

const secret = generateWebhookSecret();
const body = JSON.stringify({ type: 'webhook.test' });

test('signature round-trips and rejects tampering, wrong secret, and stale timestamps', () => {
  const now = 1_800_000_000;
  const h = signatureHeader(secret, body, now);
  assert.equal(verifySignature(secret, h, body, 300, now), true);
  assert.equal(verifySignature(secret, h, body + ' ', 300, now), false);
  assert.equal(verifySignature('whsec_other', h, body, 300, now), false);
  assert.equal(verifySignature(secret, h, body, 300, now + 301), false);
  assert.equal(verifySignature(secret, '', body, 300, now), false);
  assert.equal(verifySignature(secret, 'garbage', body, 300, now), false);
  assert.equal(verifySignature(secret, null, body, 300, now), false);
});
test('retry backoff grows and stops after MAX_ATTEMPTS', () => {
  assert.equal(nextAttemptDelaySec(1), 60);
  assert.equal(nextAttemptDelaySec(2), 300);
  assert.equal(nextAttemptDelaySec(MAX_ATTEMPTS - 1) > nextAttemptDelaySec(1), true);
  assert.equal(nextAttemptDelaySec(MAX_ATTEMPTS), null);
});
test('endpoint URL validation blocks unsafe targets', () => {
  const bad = ['http://example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.2/x',
    'https://169.254.169.254/latest', 'https://[::1]/x', 'https://user:pw@example.com/x', 'https://example.com:8443/x',
    'https://intranet/x', 'https://db.internal/x', 'not a url'];
  for (const u of bad) assert.equal(validateEndpointUrl(u).ok, false, u);
  assert.equal(validateEndpointUrl('https://example.com/hooks/leo').ok, true);
});
test('private IP detection covers v4, mapped v6 and v6 ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34']) assert.equal(isPrivateIp(ip), false, ip);
});
test('only real events are accepted', () => {
  assert.deepEqual(parseEvents(['webhook.test', 'project.deployed', 'webhook.test']), ['webhook.test']);
});
