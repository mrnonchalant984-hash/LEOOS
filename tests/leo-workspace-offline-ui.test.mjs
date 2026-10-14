import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const widget = fs.readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('Leo workspace exposes a mobile navigation drawer and accessible open/close controls', () => {
  assert.match(widget, /mobileSidebarOpen/);
  assert.match(widget, /aria-label="Open workspace navigation"/);
  assert.match(widget, /aria-label="Close workspace navigation"/);
  assert.match(widget, /role="dialog" aria-modal="true"/);
  assert.match(widget, /Recent chats/);
});

test('offline prompts are saved locally and require explicit user submission after reconnecting', () => {
  assert.match(widget, /OFFLINE_DRAFT_KEY/);
  assert.match(widget, /if \(!navigator\.onLine\)/);
  assert.match(widget, /Saved offline — not submitted/);
  assert.match(widget, /Your prompt is saved on this device and has not been sent to Leo/);
  assert.match(widget, /Send now/);
  assert.match(widget, /Discard/);
});
