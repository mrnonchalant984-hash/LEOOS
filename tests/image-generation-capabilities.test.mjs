import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isGeminiImageModel, resolveGeminiImageModel } from '../lib/generation/gemini-image.ts';

test('image generation defaults to an image-capable Gemini model', () => {
  const source = fs.readFileSync('lib/generation/gemini-image.ts', 'utf8');
  assert.match(source, /gemini-nano-banana-2\.1/);
  assert.match(source, /isGeminiImageModel/);
  assert.match(source, /text-capable and cannot generate/);
  assert.equal(isGeminiImageModel('gemini-nano-banana-2.1'), true);
  assert.equal(resolveGeminiImageModel('gemini-nano-banana-2.1'), 'gemini-nano-banana-2.1');
  assert.equal(isGeminiImageModel('gemini-2.5-flash'), false);
  assert.throws(() => resolveGeminiImageModel('gemini-2.5-flash'), /text-capable/);
});

test('image generation rejects offline-provider use and reports failed accounting recovery', () => {
  const source = fs.readFileSync('lib/generation/images.ts', 'utf8');
  assert.match(source, /LEO_OFFLINE_MODE === 'true'/);
  assert.match(source, /refundConfirmed/);
  assert.match(source, /credit refund could not be confirmed/);
  assert.match(source, /failureUpdateError/);
  assert.match(source, /processingError/);
  assert.match(source, /platformReservationAttempted = !reserve\.error\.code/);
  assert.match(source, /insufficient platform credits/i);
  assert.match(source, /platform credit account not found/i);
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
  assert.match(source, /platformReservationAttempted = !reserve\.error\.code/);
  assert.match(source, /platform credit account not found/i);
});
