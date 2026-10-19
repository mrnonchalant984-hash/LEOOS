import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  buildDeployRequestHash,
  getBuildDeployRateLimitPerHour,
  resolveBuildDeployIdempotencyKey,
} from '../lib/build-deploy-idempotency.ts';
import { parseRetryAfter, ProviderHttpError, requestProviderJson } from '../lib/provider-http.ts';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('deployment request hashes are stable, tenant scoped, and content sensitive', () => {
  const first = { prompt: 'LaunchDesk', generated_files: [{ path: 'app/page.tsx', content: 'one' }, { path: 'package.json', content: '{}' }] };
  const reordered = { generated_files: [{ content: '{}', path: 'package.json' }, { content: 'one', path: 'app/page.tsx' }], prompt: 'LaunchDesk' };
  const hash = buildDeployRequestHash('user-a', 'project-a', first);
  assert.equal(hash, buildDeployRequestHash('user-a', 'project-a', reordered));
  assert.notEqual(hash, buildDeployRequestHash('user-b', 'project-a', first));
  assert.notEqual(hash, buildDeployRequestHash('user-a', 'project-b', first));
  assert.notEqual(hash, buildDeployRequestHash('user-a', 'project-a', { ...first, generated_files: [{ path: 'app/page.tsx', content: 'changed' }] }));
  assert.equal(hash.length, 64);
});

test('deployment idempotency keys are validated and default to the request hash', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(resolveBuildDeployIdempotencyKey(null, undefined, hash), { key: hash });
  assert.deepEqual(resolveBuildDeployIdempotencyKey('request-1234', 'request-1234', hash), { key: 'request-1234' });
  assert.equal('error' in resolveBuildDeployIdempotencyKey('header-1234', 'body-12345', hash), true);
  assert.equal('error' in resolveBuildDeployIdempotencyKey(null, 'unsafe key', hash), true);
});

test('deployment attempt cap is server configurable and bounded', () => {
  assert.equal(getBuildDeployRateLimitPerHour(undefined), 3);
  assert.equal(getBuildDeployRateLimitPerHour('12'), 12);
  assert.equal(getBuildDeployRateLimitPerHour('0'), 3);
  assert.equal(getBuildDeployRateLimitPerHour('1000'), 3);
  assert.equal(getBuildDeployRateLimitPerHour('invalid'), 3);
});

test('Retry-After supports provider seconds and HTTP dates', () => {
  const now = Date.parse('2026-10-19T00:00:00Z');
  assert.equal(parseRetryAfter('4', now), 4);
  assert.equal(parseRetryAfter(new Date(now + 5000).toUTCString(), now), 5);
  assert.equal(parseRetryAfter('not-a-delay', now), null);
});

test('safe provider reads honor Retry-After and retry, without exposing provider bodies', async () => {
  const responses = [
    new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'sensitive provider detail' } }), { status: 429, headers: { 'retry-after': '3' } }),
    new Response(JSON.stringify({ id: 'deployment-1' }), { status: 200 }),
  ];
  const delays = [];
  const value = await requestProviderJson('vercel', 'https://api.vercel.com/read', {}, {
    fetcher: async () => responses.shift(),
    wait: async (milliseconds) => delays.push(milliseconds),
    now: () => 1000,
    maxAttempts: 2,
  });
  assert.deepEqual(value, { id: 'deployment-1' });
  assert.deepEqual(delays, [3000]);

  const failure = await requestProviderJson('vercel', 'https://api.vercel.com/read', {}, {
    fetcher: async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'sensitive provider detail' } }), { status: 429 }),
    wait: async () => {},
    random: () => 0,
    now: () => 1000,
    maxAttempts: 1,
  }).then(() => null, (error) => error);
  assert.ok(failure instanceof ProviderHttpError);
  assert.equal(failure.code, 'RATE_LIMITED');
  assert.equal(failure.retryAfterSeconds, null);
  assert.doesNotMatch(failure.message, /sensitive provider detail/);
});

test('provider writes are never replayed and exhausted quotas are marked non-retryable', async () => {
  let calls = 0;
  await assert.rejects(requestProviderJson('github', 'https://api.github.com/write', { method: 'POST', body: '{}' }, {
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: 'monthly quota exhausted' }), { status: 429, headers: { 'retry-after': '60' } });
    },
    wait: async () => {},
    maxAttempts: 5,
  }), (error) => error instanceof ProviderHttpError && error.code === 'QUOTA_EXHAUSTED' && error.retryable === false && error.retryAfterSeconds === 60);
  assert.equal(calls, 1);
});

test('database admission keeps rate-limit, idempotency, and build creation atomic', async () => {
  const migration = await source('supabase/migrations/20261018180000_build_deploy_idempotency.sql');
  const route = await source('app/api/build-deploy/route.ts');
  assert.match(migration, /unique index if not exists idx_project_builds_idempotency/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /consume_user_rate_limit/i);
  assert.match(migration, /'in_progress'/i);
  assert.match(route, /start_customer_project_build_idempotent/);
  assert.doesNotMatch(route, /enforceUserRateLimit/);
  assert.match(route, /admission\.disposition === 'duplicate'/);
});

test('MCP deployment exposes idempotency and persisted status while provider failures remain sanitized', async () => {
  const server = await source('lib/mcp/server.ts');
  const mcpRoute = await source('app/mcp/route.ts');
  const route = await source('app/api/build-deploy/route.ts');
  assert.match(server, /idempotency_key: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(mcpRoute, /headers\.set\('Idempotency-Key'/);
  assert.match(mcpRoute, /deployment_url,created_at,started_at,completed_at/);
  assert.match(route, /event: providerError\.code === 'RATE_LIMITED' \? 'leo\.provider\.rate_limited'/);
  assert.match(route, /providerError\.retryAfterSeconds/);
  assert.doesNotMatch(route, /GitHub API \$\{r\.status\}: \$\{await r\.text\(\)\}/);
  assert.doesNotMatch(route, /Vercel API \$\{r\.status\}: \$\{await r\.text\(\)\}/);
});
