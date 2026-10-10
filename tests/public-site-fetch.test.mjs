import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicSiteUrl } from '../lib/public-site-url.ts';

test('public site URL validation rejects private targets, credentials, and custom ports', () => {
  const invalid = [
    'file:///etc/passwd',
    'http://localhost',
    'http://127.0.0.1',
    'https://169.254.169.254/latest',
    'https://[::1]/',
    'https://service.internal/',
    'https://user:password@example.com/',
    'https://example.com:8443/',
  ];
  for (const url of invalid) assert.throws(() => validatePublicSiteUrl(url), undefined, url);
});

test('public site URL validation accepts public HTTP/HTTPS URLs and removes fragments', () => {
  assert.equal(validatePublicSiteUrl('https://example.com/path#private').toString(), 'https://example.com/path');
  assert.equal(validatePublicSiteUrl('http://example.com').protocol, 'http:');
});
