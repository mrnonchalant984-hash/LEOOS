import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { openApiV1 } from '../lib/openapi-v1.ts';

test('OpenAPI document version is separate and public endpoints use v1', () => {
  assert.equal(openApiV1.openapi, '3.1.0');
  assert.equal(openApiV1.info.version, '1.0.0');
  assert.equal('apiVersion' in openApiV1.info, false);
  assert.deepEqual(Object.keys(openApiV1.paths).sort(), [
    '/v1/me',
    '/v1/projects',
    '/v1/projects/{id}',
    '/v1/projects/{id}/status',
    '/v1/usage',
  ]);
  assert.equal(openApiV1.paths['/v1/projects'].post.requestBody.required, true);
});

test('every documented API route is backed by a route handler', async () => {
  const files = {
    '/v1/me': 'app/api/v1/me/route.ts',
    '/v1/projects': 'app/api/v1/projects/route.ts',
    '/v1/projects/{id}': 'app/api/v1/projects/[id]/route.ts',
    '/v1/projects/{id}/status': 'app/api/v1/projects/[id]/status/route.ts',
    '/v1/usage': 'app/api/v1/usage/route.ts',
  };
  await Promise.all(Object.values(files).map((file) => access(join(process.cwd(), file))));
});
