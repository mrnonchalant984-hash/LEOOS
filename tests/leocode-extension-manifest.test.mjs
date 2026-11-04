import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LeoCode chat is registered as a webview so VS Code displays its chat interface', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extensions/leocode/package.json', import.meta.url), 'utf8'));
  const chatView = manifest.contributes.views.leocode.find(view => view.id === 'leocode.chat');

  assert.ok(chatView, 'LeoCode chat view should be contributed');
  assert.equal(chatView.type, 'webview');
  assert.ok(manifest.activationEvents.includes('onView:leocode.chat'));
});
