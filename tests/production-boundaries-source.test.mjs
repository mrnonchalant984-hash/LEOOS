import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('MCP uses hashed opaque tokens, checks allowlisted origins, and scopes tool execution to the token owner', async () => {
  const oauth = await read('lib/mcp/oauth.ts');
  const route = await read('app/mcp/route.ts');
  const server = await read('lib/mcp/server.ts');
  assert.match(oauth, /createHash\('sha256'\)/);
  assert.match(oauth, /access_token_hash/);
  assert.match(oauth, /revoked_at/);
  assert.match(route, /isAllowedMcpOrigin/);
  assert.match(route, /validateMcpAccessToken/);
  assert.match(route, /handleUserMcpRequest\(request, token\.userId, token\.scopes/);
  assert.match(server, /export function createUserMcpServer\(userId: string, scopes: string\[\]/);
  assert.match(server, /const writeAccess = scopes\.includes\('mcp:write'\)/);
  assert.match(server, /projects\.getProject\(userId, project_id\)/);
});

test('private Android and Expo downloads enforce account ownership and verify bytes before serving', async () => {
  const android = await read('app/api/builds/android/[id]/artifact/route.ts');
  const expo = await read('app/api/builds/expo/[id]/artifact/route.ts');
  assert.match(android, /\.eq\('owner_user_id', actor\.user\.id\)/);
  assert.match(android, /createHash\('sha256'\)/);
  assert.match(android, /verifyAndroidApk\(/);
  assert.match(android, /Cache-Control': 'private, no-store'/);
  assert.match(expo, /\.eq\('owner_user_id', ctx\.user\.id\)/);
  assert.match(expo, /artifact_expires_at/);
  assert.match(expo, /verifyExpoArtifact\(/);
  assert.match(expo, /checksum !== job\.artifact_sha256/);
  assert.match(expo, /Cache-Control': 'private, no-store'/);
});
