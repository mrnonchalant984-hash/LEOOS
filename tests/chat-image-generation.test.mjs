import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestsImageGeneration } from '../lib/ai/chat-image-intent.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('normal chat recognizes explicit image-generation requests without treating image questions as generation', () => {
  assert.equal(requestsImageGeneration('Generate an image of a night market'), true);
  assert.equal(requestsImageGeneration('Generate a hero image for my website'), true);
  assert.equal(requestsImageGeneration('Make me a logo for a bakery'), true);
  assert.equal(requestsImageGeneration('How do image generators work?'), false);
  assert.equal(requestsImageGeneration('Create a website with an image section'), false);
});

test('chat persists an authenticated image asset reference and returns it for rendering', () => {
  const route = read('app/api/chat/route.ts');
  const media = read('app/api/media/[id]/route.ts');
  const widget = read('components/LEOWidget.tsx');
  assert.match(route, /generateAndPersistImage/);
  assert.match(route, /\/api\/media\/\$\{encodeURIComponent\(result\.asset_id\)\}\?view=1/);
  assert.match(route, /generatedImage\.assetId/);
  assert.match(media, /searchParams\.get\('view'\) === '1'/);
  assert.match(widget, /d\.assetId/);
});
