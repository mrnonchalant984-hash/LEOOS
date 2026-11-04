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

test('offline chat fails closed while local-model execution is disabled by Gemini-only policy', async () => {
  const source = await read('app/api/offline/chat/route.ts');
  assert.match(source, /LOCAL_MODEL_DISABLED/);
  assert.doesNotMatch(source, /LEO_LOCAL_MODEL_URL|createTextResponse/);
  const docs = await read('docs/OFFLINE-LOCAL-MODEL-SETUP.md');
  assert.match(docs, /local inference is disabled/i);
  assert.match(docs, /does not run a local language model/i);
});
