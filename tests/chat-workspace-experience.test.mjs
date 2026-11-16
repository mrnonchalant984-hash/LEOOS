import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const widget = readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/LEOAppShell.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const mediaRoute = readFileSync(new URL('../app/api/media/[id]/route.ts', import.meta.url), 'utf8');

test('Leo workspace exposes distinct Chat and Work destinations', () => {
  assert.match(shell, /Link href="\/app"[^>]*>Chat<\/Link>/);
  assert.match(shell, /Link href="\/engineering"[^>]*>Work<\/Link>/);
  assert.match(widget, /setWorkspaceMode\("chat"\).*Chat/s);
  assert.match(widget, /setWorkspaceMode\("work"\).*Work/s);
  assert.match(shell, /aria-label="Workspace mode"/);
});

test('chat scroll follows new content only while pinned and offers jump-to-latest', () => {
  assert.match(widget, /chatPinnedToBottom\.current/);
  assert.match(widget, /scrollHeight - element\.scrollTop - element\.clientHeight/);
  assert.match(widget, /Jump to latest/);
});

test('conversation restoration prefers account state and falls back to local state', () => {
  assert.match(widget, /cache: "no-store"/);
  assert.match(widget, /leo_chat_\$\{chat\.id\}/);
  assert.match(widget, /Showing this device's saved copy/);
});

test('pending images can be replaced or removed before submission', () => {
  assert.match(widget, /Replace/);
  assert.match(widget, /setPendingImages\(current => current\.filter/);
  assert.match(widget, /uploadChatImage\(f, replacingImageId\)/);
  assert.match(widget, /deleteChatImageAsset\(replaceAssetId\)/);
  assert.match(widget, /removePendingChatImage\(image\.assetId\)/);
  assert.match(mediaRoute, /metadata\.chat_image === true/);
  assert.match(mediaRoute, /chat-images\/\$\{user\.user\.id\}\//);
});

test('chat workspace has visible keyboard focus and mobile safe-area treatment', () => {
  assert.match(styles, /\.leo-chat-workspace button:focus-visible/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /prefers-reduced-motion/);
});
