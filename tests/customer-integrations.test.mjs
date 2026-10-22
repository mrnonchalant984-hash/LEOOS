import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isValidCustomDomain, isValidVercelProjectId } from '../lib/integrations/domain-validation.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('custom-domain validation accepts ordinary DNS hostnames and rejects URLs/unsafe forms', () => {
  assert.equal(isValidCustomDomain('example.com'), true);
  assert.equal(isValidCustomDomain('shop.example.co.uk'), true);
  assert.equal(isValidCustomDomain('WWW.Example.com'), true);
  for (const value of ['https://example.com', 'example.com/path', 'user@example.com', '-bad.example.com', 'bad..example.com', 'localhost', '']) {
    assert.equal(isValidCustomDomain(value), false, `${value} should be rejected`);
  }
});

test('Vercel project identifiers are bounded and cannot contain URL syntax', () => {
  assert.equal(isValidVercelProjectId('prj_abc123'), true);
  assert.equal(isValidVercelProjectId('my-project'), true);
  for (const value of ['', '../project', 'https://vercel.com', 'x'.repeat(129), null]) assert.equal(isValidVercelProjectId(value), false);
});

test('customer integration API never selects encrypted credentials for list responses and scopes by user', async () => {
  const source = await read('app/api/integrations/connections/route.ts');
  assert.match(source, /const safeSelect = 'id,provider,label,status,scopes,metadata,last_verified_at,last_error_code,created_at,updated_at'/);
  assert.match(source, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(source, /sealConnectionConfig\(config\)/);
  assert.doesNotMatch(source, /select\([^\n]*credential_ciphertext[^\n]*\)/);
});

test('domain operations use the authenticated user’s verified Vercel connection and verify project access', async () => {
  const source = await read('app/api/integrations/vercel/domains/route.ts');
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /\.eq\('provider', 'vercel'\)/);
  assert.match(source, /\.eq\('status', 'verified'\)/);
  assert.match(source, /\/v9\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(source, /method: 'DELETE'/);
});

test('build deployment prefers a verified customer-owned GitHub/Vercel credential per request', async () => {
  const source = await read('app/api/build-deploy/route.ts');
  assert.match(source, /getCustomerProviderToken\(ctx\.user\.id, 'github'\)/);
  assert.match(source, /getCustomerProviderToken\(ctx\.user\.id, 'vercel'\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /force: false/);
});

test('customer credential storage is user-scoped, encrypted by the application, and denies direct client table access', async () => {
  const migration = await read('supabase/migrations/20261021210000_user_owned_integrations.sql');
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /alter table public\.user_integrations enable row level security/i);
  assert.match(migration, /revoke all on public\.user_integrations from anon, authenticated/i);
  const service = await read('lib/integrations/customer-connections.ts');
  assert.match(service, /encryptMcpCredential\(JSON\.stringify\(config\)\)/);
  assert.match(service, /decryptMcpCredential\(ciphertext\)/);
});

test('provider OAuth uses expiring single-use state, authenticated start, and server-only secrets', async () => {
  const start = await read('app/api/integrations/oauth/start/route.ts');
  const callback = await read('app/api/integrations/oauth/callback/route.ts');
  const migration = await read('supabase/migrations/20261021220000_integration_oauth_states.sql');
  assert.match(start, /getProfile\(request\)/);
  assert.match(start, /randomBytes\(32\)/);
  assert.match(start, /createHash\('sha256'\)/);
  assert.match(callback, /state_already_used/);
  assert.match(callback, /used_at/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /revoke all on public\.integration_oauth_states from anon, authenticated/i);
});

test('provider operations are scoped to the signed-in user and require confirmation for writes', async () => {
  const route = await read('app/api/integrations/[provider]/[action]/route.ts');
  assert.match(route, /\.eq\('user_id', userId\)/);
  assert.match(route, /body\.confirm !== true/);
  assert.match(route, /apply-migration/);
  assert.match(route, /firestore-document/);
  assert.match(route, /send-message/);
  assert.match(route, /deploy-git-repo/);
  assert.match(route, /map\(\(\{ access_token: _secret, \.\.\.page \}\) => page\)/); // tokens are removed from public page-list results
});

test('provider OAuth environment and operational docs are included', async () => {
  const env = await read('.env.example');
  const docs = await read('docs/CUSTOMER-INTEGRATIONS-OPERATIONS.md');
  for (const key of ['GITHUB_OAUTH_CLIENT_SECRET', 'VERCEL_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_CLIENT_SECRET', 'META_APP_SECRET', 'INTEGRATION_OAUTH_CALLBACK_URL']) assert.match(env, new RegExp(key));
  for (const item of ['apply-migration', 'firestore-document', 'youtube', 'WhatsApp Business', 'MCP_CREDENTIAL_ENCRYPTION_KEY']) assert.match(docs, new RegExp(item, 'i'));
});
