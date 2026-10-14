import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectImageUpload, MAX_STUDIO_IMAGE_BYTES } from '../lib/generation/image-input.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('studio upload validation accepts supported image signatures with matching MIME', () => {
  assert.deepEqual(inspectImageUpload(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'image/png'), { mimeType: 'image/png', extension: 'png' });
  assert.deepEqual(inspectImageUpload(Uint8Array.from([0xff,0xd8,0xff]), 'image/jpeg'), { mimeType: 'image/jpeg', extension: 'jpg' });
  assert.deepEqual(inspectImageUpload(Uint8Array.from([0x52,0x49,0x46,0x46,0x00,0x00,0x00,0x00,0x57,0x45,0x42,0x50]), 'image/webp'), { mimeType: 'image/webp', extension: 'webp' });
});

test('studio upload validation rejects spoofed MIME, unsupported files, and oversized images', () => {
  assert.equal(inspectImageUpload(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'image/jpeg'), null);
  assert.equal(inspectImageUpload(Uint8Array.from([0x25,0x50,0x44,0x46]), 'application/pdf'), null);
  assert.equal(inspectImageUpload(new Uint8Array(MAX_STUDIO_IMAGE_BYTES + 1), 'image/png'), null);
});

test('studio image edit is authenticated, rate limited, persists private assets, and refunds failures', async () => {
  const route = await read('app/api/studio/edit-image/route.ts');
  const edit = await read('lib/generation/image-edit.ts');
  const history = await read('app/api/studio/history/route.ts');
  assert.match(route, /getProfile\(request\)/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(edit, /images\.edit/);
  assert.match(edit, /inspectImageUpload/);
  assert.match(edit, /studio-inputs\//);
  assert.match(edit, /studio-edits\//);
  assert.match(edit, /reserve_platform_credits/);
  assert.match(edit, /refund_platform_credits/);
  assert.match(history, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(history, /createSignedUrl/);
});

test('studio UI exposes only implemented creative modes', async () => {
  const workspace = await read('components/studio/StudioWorkspace.tsx');
  assert.match(workspace, /Create image/);
  assert.match(workspace, /Edit image/);
  assert.match(workspace, /Create video/);
  assert.doesNotMatch(workspace, /Image-to-video|Animate image|Save to project/i);
});
