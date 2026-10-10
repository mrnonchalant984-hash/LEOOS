import test from 'node:test';
import assert from 'node:assert/strict';
import { correlationId, parseSampleRate, sanitizeSentryEvent, sanitizeVercelPageEvent } from '../lib/monitoring-utils.ts';

test('monitoring correlation ids accept UUIDs and replace arbitrary client values', () => {
  const valid = '90f7a5bc-0735-46eb-8f49-a56c5d1e4210';
  assert.equal(correlationId(valid), valid);
  assert.match(correlationId('customer@example.com'), /^[0-9a-f-]{36}$/i);
});

test('trace sampling is bounded and falls back on invalid configuration', () => {
  assert.equal(parseSampleRate('0.025'), 0.025);
  assert.equal(parseSampleRate('0'), 0);
  assert.equal(parseSampleRate('2'), 0.05);
  assert.equal(parseSampleRate('not-a-number', 0.1), 0.1);
});

test('Vercel analytics and vitals events strip query data and parameterize private workspace ids', () => {
  const safe = sanitizeVercelPageEvent({
    type: 'vital',
    url: 'https://leo.example/ide/90f7a5bc-0735-46eb-8f49-a56c5d1e4210?token=private&email=user%40example.com',
    route: '/ide/90f7a5bc-0735-46eb-8f49-a56c5d1e4210',
  });
  assert.equal(safe.url, 'https://leo.example/ide/:id');
  assert.equal(safe.route, '/ide/:id');
  assert.equal(sanitizeVercelPageEvent({ url: 'not-an-absolute-url' }), null);
});

test('Sentry event sanitization removes credentials, identity, and private content while retaining safe context', () => {
  const event = {
    message: 'private prompt text',
    user: { id: 'user-id', email: 'leonard@example.com' },
    request: {
      url: 'https://leonardx.example/api/workspaces/90f7a5bc-0735-46eb-8f49-a56c5d1e4210/files?token=private',
      method: 'PATCH',
      headers: { authorization: 'Bearer private-token', cookie: 'private-cookie' },
      data: { files: { 'secret.ts': 'private source' }, prompt: 'private prompt text' },
      query_string: 'token=private',
    },
    tags: { operation: 'project.build_deploy', request_id: '90f7a5bc-0735-46eb-8f49-a56c5d1e4210', email: 'private@example.com' },
    extra: { apiKey: 'private-api-key' },
    contexts: { trace: { trace_id: 'trace-id', prompt: 'private prompt text' }, browser: { name: 'Browser' } },
    breadcrumbs: [
      { category: 'console', message: 'private prompt text', data: { authorization: 'private-token' } },
      { category: 'navigation', message: 'private navigation', data: { to: '/projects/90f7a5bc-0735-46eb-8f49-a56c5d1e4210?token=private' } },
    ],
    exception: { values: [{ type: 'OpenAIError', value: 'private prompt text', stacktrace: { frames: [{ filename: 'app/api/chat/route.ts', vars: { prompt: 'private prompt text' }, context_line: 'private prompt text' }] } }] },
    spans: [{ description: 'POST /api/workspaces/90f7a5bc-0735-46eb-8f49-a56c5d1e4210/files', data: { 'http.response.status_code': 500, 'http.url': 'https://example.test?token=private', prompt: 'private prompt text' } }],
  };

  const safe = sanitizeSentryEvent(event);
  const serialized = JSON.stringify(safe);
  for (const secret of ['private prompt text', 'private-token', 'private-cookie', 'private-api-key', 'leonard@example.com', 'private@example.com', 'secret.ts']) {
    assert.equal(serialized.includes(secret), false, `${secret} must not be sent to Sentry`);
  }
  assert.equal(safe.request.url, '/api/workspaces/:id/files');
  assert.equal(safe.exception.values[0].value, 'OpenAIError (details redacted)');
  assert.equal(safe.tags.operation, 'project.build_deploy');
  assert.equal(safe.tags.email, undefined);
  assert.equal(safe.breadcrumbs.length, 1);
});
