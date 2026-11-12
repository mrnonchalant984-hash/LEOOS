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

test('Leo workspace image actions persist user and assistant messages for reload', () => {
  const route = read('app/api/chat/route.ts');
  const media = read('app/api/media/[id]/route.ts');
  const widget = read('components/LEOWidget.tsx');
  const workspace = read('components/AppWorkspaceEntry.tsx');
  const appPage = read('app/app/page.tsx');
  assert.match(route, /generateAndPersistImage/);
  assert.match(route, /\/api\/media\/\$\{encodeURIComponent\(result\.asset_id\)\}\?view=1/);
  assert.match(route, /generatedImage\.assetId/);
  assert.match(route, /messages: data\?\.messages \|\| \[\]/);
  assert.match(route, /const messages = \[\s*\.\.\.history,\s*\{ role: "user" as const, content: message \}/);
  assert.match(widget, /fetch\("\/api\/chat"/);
  assert.match(widget, /session_id: sidRef\.current/);
  assert.match(widget, /image_mode: mode/);
  assert.match(widget, /image: d\.image, assetId: d\.assetId/);
  assert.match(widget, /m\.image &&/);
  assert.match(widget, /fetch\(`\/api\/chat\?session_id=/);
  assert.match(workspace, /<LEOWidget full initialSessionId=/);
  assert.match(appPage, /<AppWorkspaceEntry \/>/);
  assert.match(media, /searchParams\.get\('view'\) === '1'/);
});

test('image generation exposes owner billing without reserving credits', () => {
  const generation = read('lib/generation/images.ts');
  const route = read('app/api/chat/route.ts');
  assert.match(generation, /if \(access\.owner\) \{\s*platformCost = 0;/);
  assert.match(generation, /credit_source: access\.owner \? 'owner' : creditSource/);
  assert.match(route, /No credits were charged \(owner access\)/);
});

test('chat image generation validates and forwards supported visual styles', () => {
  const route = read('app/api/chat/route.ts');
  assert.match(route, /requestedImageMode !== undefined && !\['image', '3d', 'diagram'\]\.includes\(requestedImageMode\)/);
  assert.match(route, /mode: requestedImageMode === '3d' \|\| requestedImageMode === 'diagram' \? requestedImageMode : 'image'/);
});
