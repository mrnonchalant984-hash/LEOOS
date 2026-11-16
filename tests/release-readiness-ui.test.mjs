import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Leo empty state uses a time-aware greeting and does not render welcome shortcut prompts', async () => {
  const widget = await read('components/LEOWidget.tsx');
  assert.match(widget, /Good morning/);
  assert.match(widget, /Good afternoon/);
  assert.match(widget, /Good evening/);
  assert.match(widget, /Your workspace is ready/);
  assert.doesNotMatch(widget, /Let’s brainstorm|Let’s create|Quick starts/);
});

test('release readiness dashboard labels environment presence separately from verified readiness', async () => {
  const ui = await read('components/ReleaseReadinessDashboard.tsx');
  const api = await read('app/api/admin/release-readiness/route.ts');
  assert.match(ui, /Verification pending/);
  assert.match(ui, /Presence only/);
  assert.match(ui, /Owner 2FA access/);
  assert.match(api, /requireOwner/);
  assert.match(api, /Never return credential values/);
});

test('Leo workspace uses dynamic viewport sizing and mobile safe-area composer padding', async () => {
  const page = await read('app/app/page.tsx');
  const css = await read('app/globals.css');
  assert.match(page, /h-\[100dvh\]/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.leo-chat-scroll/);
});
