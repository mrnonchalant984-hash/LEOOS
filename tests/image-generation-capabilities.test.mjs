import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('image generation defaults to an image-capable Gemini model', () => {
  const source = fs.readFileSync('lib/generation/gemini-image.ts', 'utf8');
  assert.match(source, /gemini-2\.5-flash-image-preview/);
  assert.match(source, /isGeminiImageModel/);
  assert.match(source, /text-capable and cannot generate/);
});

test('image persistence uses private user-scoped assets and signed URLs', () => {
  const source = fs.readFileSync('lib/generation/images.ts', 'utf8');
  assert.match(source, /generated-images\/\$\{options\.userId\}/);
  assert.match(source, /createSignedUrl/);
  assert.match(source, /request_key: requestKey/);
});

test('image editing validates image-capable models and deduplicates request keys', () => {
  const source = fs.readFileSync('lib/generation/image-edit.ts', 'utf8');
  assert.match(source, /resolveGeminiImageModel/);
  assert.match(source, /request_key: requestKey/);
  assert.match(source, /duplicate: true/);
});
