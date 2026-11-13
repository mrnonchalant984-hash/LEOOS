import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const image = await readFile(new URL('../lib/generation/gemini-image.ts', import.meta.url), 'utf8');
const imageRoute = await readFile(new URL('../app/api/generate-image/route.ts', import.meta.url), 'utf8');
const edit = await readFile(new URL('../lib/generation/image-edit.ts', import.meta.url), 'utf8');
const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

test('Gemini image generation uses the documented image response modality and candidate inline image data', () => {
  assert.match(image, /client\.models\.generateContent/);
  assert.match(image, /responseModalities:\s*\['IMAGE'\]/);
  assert.match(image, /inlineData:\s*\{\s*mimeType:/);
  assert.match(image, /candidate\.content\?\.parts/);
  assert.match(image, /generated\?\.inlineData\?\.data/);
  assert.doesNotMatch(image, /client\.interactions\.create/);
});

test('image generation and editing share the corrected Gemini image provider', () => {
  assert.match(imageRoute, /generateAndPersistImage/);
  assert.match(edit, /generateGeminiImage\(/);
  assert.match(env, /^LEO_GEMINI_IMAGE_MODEL=gemini-nano-banana-2\.1$/m);
});

test('image failures surface model and billing configuration diagnostics without exposing credentials', () => {
  assert.match(imageRoute, /image model|no image data|billing project/);
  assert.match(image, /Confirm the image model is enabled for this API key and billing project/);
  assert.doesNotMatch(image, /console\.(log|error).*apiKey/);
});
