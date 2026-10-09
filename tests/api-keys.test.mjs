import test from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey, parseScopes, hasScope, keyState, KEY_PREFIX } from '../lib/api-keys-core.ts';

test('generated keys are prefixed, unique, and only the hash matches', () => {
  const a = generateApiKey(), b = generateApiKey();
  assert.ok(a.raw.startsWith(KEY_PREFIX));
  assert.notEqual(a.raw, b.raw);
  assert.equal(a.hash, hashApiKey(a.raw));
  assert.notEqual(a.hash, a.raw);
  assert.ok(a.raw.startsWith(a.prefix));
});
test('unknown scopes are dropped and duplicates removed', () => {
  assert.deepEqual(parseScopes(['projects:read', 'admin:all', 'projects:read']), ['projects:read']);
  assert.deepEqual(parseScopes('projects:read'), []);
});
test('scope checks fail closed', () => {
  assert.equal(hasScope(['projects:read'], 'projects:read'), true);
  assert.equal(hasScope([], 'projects:read'), false);
  assert.equal(hasScope(null, 'projects:read'), false);
  assert.equal(hasScope(['write'], 'read'), true);
  assert.equal(hasScope(['read'], 'write'), false);
});
test('revoked and expired keys are not active', () => {
  assert.equal(keyState({ revoked_at: '2026-01-01T00:00:00Z' }), 'revoked');
  assert.equal(keyState({ expires_at: '2020-01-01T00:00:00Z' }), 'expired');
  assert.equal(keyState({ expires_at: '2999-01-01T00:00:00Z' }), 'active');
  assert.equal(keyState({}), 'active');
});
