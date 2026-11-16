import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/chat/images/route.ts', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../lib/ai/provider-registry.ts', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('chat image uploads require same-origin authenticated requests and private per-user storage', () => {
  assert.match(route, /request\.headers\.get\('origin'\)/);
  assert.match(route, /getProfile\(request\)/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /inspectImageUpload\(bytes, file\.type\)/);
  assert.match(route, /chat-images\/\$\{auth\.user\.id\}/);
  assert.match(route, /chat_image: true/);
});

test('chat verifies image ownership and content before passing inline data to Gemini', () => {
  assert.match(chat, /\.eq\('user_id', ctx\.user\.id\).*\.eq\('kind', 'image'\)/);
  assert.match(chat, /metadata\.chat_image !== true/);
  assert.match(chat, /inspectImageUpload\(bytes, asset\.mime_type\)/);
  assert.match(chat, /images: chatImages\.map\(\(\{ mimeType, data \}\) => \(\{ mimeType, data \}\)\)/);
  assert.match(chat, /image_asset_ids: imageAssetIds/);
});

test('Gemini provider attaches image parts to the latest user turn', () => {
  assert.match(provider, /providerContents\(messages: ModelMessage\[\], images/);
  assert.match(provider, /inlineData: \{ mimeType: image\.mimeType, data: image\.data \}/);
  assert.match(provider, /providerContents\(request\.messages, request\.images\)/);
});

test('Leo chat previews, removes, and submits image attachments with text', () => {
  assert.match(widget, /uploadChatImage/);
  assert.match(widget, /pendingImages/);
  assert.match(widget, /image_asset_ids/);
  assert.match(widget, /Remove \$\{image\.fileName\}/);
  assert.match(widget, /m\.images\?\.map/);
});
