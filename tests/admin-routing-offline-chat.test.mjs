import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner workspace layouts forward auth and do not send owners to customer agents on errors', async () => {
  for (const [layout, endpoint] of [['app/workforce/layout.tsx', '/api/workforce'], ['app/meeting-room/layout.tsx', '/api/meetings']]) {
    const source = await read(layout);
    assert.match(source, /authFetch/);
    assert.ok(source.includes(`authFetch('${endpoint}'`));
    assert.match(source, /Owner access not verified/);
    assert.doesNotMatch(source, /router\.replace\('\/agents'\)/);
  }
});

test('owner admin navigation links to independent dashboards', async () => {
  const source = await read('app/admin/page.tsx');
  for (const path of ['/workforce', '/workforce/jobs', '/workforce/monitoring', '/workforce/conversations', '/meeting-room', '/workflows', '/offline']) {
    assert.ok(source.includes(`href='${path}'`), `Missing admin navigation link ${path}`);
  }
});

test('offline chat refuses hosted fallback and requires a local model endpoint', async () => {
  const source = await read('app/api/offline/chat/route.ts');
  assert.match(source, /LEO_OFFLINE_MODE !== 'true'/);
  assert.match(source, /LEO_LOCAL_MODEL_URL/);
  assert.match(source, /createTextResponse/);
  assert.match(source, /never falls back to a hosted AI provider/i);
  const docs = await read('docs/OFFLINE-LOCAL-MODEL-SETUP.md');
  assert.match(docs, /http:\/\/127\.0\.0\.1:11434\/v1/);
  assert.match(docs, /Vercel-hosted page cannot load or call its server API when the device has no internet/);
});
