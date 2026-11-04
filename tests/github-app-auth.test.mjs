import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { test } from 'node:test';
import {
  createGitHubAppJwt,
  getGitHubAppConfigurationMode,
  getGitHubAppInstallationToken,
  getMainWebsiteGitHubToken,
} from '../lib/mcp/github-app-auth.ts';

function testKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function verifyJwt(jwt, publicKey) {
  const [header, payload, signature] = jwt.split('.');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  verifier.end();
  return verifier.verify(publicKey, signature, 'base64url');
}

test('GitHub App JWT uses RS256, numeric App ID, and a short lifetime', () => {
  const { privateKey, publicKey } = testKeyPair();
  const now = Date.parse('2026-10-29T12:00:00Z');
  const jwt = createGitHubAppJwt('123456', privateKey.replace(/\n/g, '\\n'), now);
  const [header, payload] = jwt.split('.');
  assert.deepEqual(decodePart(header), { alg: 'RS256', typ: 'JWT' });
  assert.equal(decodePart(payload).iss, '123456');
  assert.equal(decodePart(payload).iat, Math.floor(now / 1000) - 30);
  assert.equal(decodePart(payload).exp - decodePart(payload).iat, 570);
  assert.equal(verifyJwt(jwt, publicKey), true);
  assert.throws(() => createGitHubAppJwt('oauth-client-id', privateKey), /numeric App ID/);
});

test('GitHub App configuration fails closed when partially configured', () => {
  const { privateKey } = testKeyPair();
  assert.equal(getGitHubAppConfigurationMode({}), 'fallback');
  assert.equal(getGitHubAppConfigurationMode({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_APP_INSTALLATION_ID: '456' }), 'app');
  assert.throws(() => getGitHubAppConfigurationMode({ GITHUB_APP_ID: '123' }), /partially configured/);
  assert.throws(() => getGitHubAppConfigurationMode({ GITHUB_APP_ID: 'oauth-client-id', GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_APP_INSTALLATION_ID: '456' }), /numeric IDs/);
});

test('installation token exchange scopes token to the configured repository and caches before expiry', async () => {
  const { privateKey } = testKeyPair();
  const now = Date.parse('2026-10-29T12:00:00Z');
  const env = {
    GITHUB_APP_ID: '902341',
    GITHUB_APP_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    GITHUB_APP_INSTALLATION_ID: '8812345',
  };
  let calls = 0;
  let seenJwt = '';
  let seenBody;
  const fetcher = async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/app/installations/8812345/access_tokens');
    seenJwt = init.headers.Authorization.slice('Bearer '.length);
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ token: 'ghs_test_installation_token', expires_at: new Date(now + 60 * 60_000).toISOString() }), { status: 201 });
  };
  const options = { env, now: () => now, fetcher };
  const first = await getGitHubAppInstallationToken({ owner: 'mrnonchalant984-hash', repository: 'LEOOS' }, options);
  const second = await getGitHubAppInstallationToken({ owner: 'mrnonchalant984-hash', repository: 'LEOOS' }, options);
  assert.equal(first, 'ghs_test_installation_token');
  assert.equal(second, first);
  assert.equal(calls, 1);
  assert.deepEqual(seenBody, { repository_names: ['LEOOS'] });
  assert.equal(decodePart(seenJwt.split('.')[0]).alg, 'RS256');
});


test('cached installation tokens refresh five minutes before expiry', async () => {
  const { privateKey } = testKeyPair();
  const start = Date.parse('2026-10-29T12:00:00Z');
  let current = start;
  let calls = 0;
  const env = { GITHUB_APP_ID: '902343', GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_APP_INSTALLATION_ID: '8812347' };
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({ token: `ghs_token_${calls}`, expires_at: new Date(current + 60 * 60_000).toISOString() }), { status: 201 });
  };
  const options = { env, now: () => current, fetcher };
  const target = { owner: 'mrnonchalant984-hash', repository: 'LEOOS' };
  assert.equal(await getGitHubAppInstallationToken(target, options), 'ghs_token_1');
  current = start + 56 * 60_000;
  assert.equal(await getGitHubAppInstallationToken(target, options), 'ghs_token_2');
  assert.equal(calls, 2);
});

test('GitHub App auth errors are sanitized and never fall back after App configuration is enabled', async () => {
  const { privateKey } = testKeyPair();
  const env = { GITHUB_APP_ID: '902342', GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_APP_INSTALLATION_ID: '8812346' };
  await assert.rejects(
    getGitHubAppInstallationToken({ owner: 'mrnonchalant984-hash', repository: 'LEOOS' }, {
      env,
      fetcher: async () => new Response(JSON.stringify({ message: 'secret token should not leak' }), { status: 403 }),
    }),
    error => error.message.includes('permissions') && !error.message.includes('secret token'),
  );
  await assert.rejects(
    getMainWebsiteGitHubToken({ owner: 'mrnonchalant984-hash', repository: 'LEOOS', fallbackToken: 'verified-user-token', options: {
      env,
      fetcher: async () => { throw new Error('network down'); },
    } }),
    /Could not reach GitHub/,
  );
});

test('verified user GitHub integration remains the fallback only when no App settings exist', async () => {
  assert.equal(await getMainWebsiteGitHubToken({
    owner: 'mrnonchalant984-hash', repository: 'LEOOS', fallbackToken: ' verified-user-token ', options: { env: {} },
  }), 'verified-user-token');
  await assert.rejects(getMainWebsiteGitHubToken({ owner: 'mrnonchalant984-hash', repository: 'LEOOS', options: { env: {} } }), /no verified GitHub integration token/);
  await assert.rejects(getMainWebsiteGitHubToken({
    owner: 'mrnonchalant984-hash', repository: 'LEOOS', fallbackToken: 'verified-user-token', options: { env: { GITHUB_APP_ID: '123' } },
  }), /partially configured/);
});
