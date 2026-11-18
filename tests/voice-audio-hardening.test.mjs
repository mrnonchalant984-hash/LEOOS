import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../app/api/voice/route.ts', import.meta.url), 'utf8');
test('voice defaults to current Gemini audio and speech models', () => {
  assert.match(route, /LEO_GEMINI_AUDIO_MODEL\\?\\.trim\\(\\) \\|\\| 'gemini-3\\.8-flash'/);
  assert.match(route, /LEO_GEMINI_TTS_MODEL\\?\\.trim\\(\\) \\|\\| 'gemini-3\\.8-flash-tts'/);
});
test('voice validates audio size and supported content types before provider processing', () => {
  assert.match(route, /MAX_VOICE_AUDIO_BYTES = 15 \* 1024 \* 1024/);
  assert.match(route, /SUPPORTED_AUDIO_TYPES/);
  assert.match(route, /audio\/webm/);
  assert.match(route, /audio\/wav/);
  assert.match(route, /Choose an audio recording no larger than 15 MB/);
});
test('voice reads transcript text from candidate parts when response.text is empty', () => {
  assert.match(route, /function extractTranscript/);
  assert.match(route, /response\.candidates \|\| \[\]/);
  assert.match(route, /Gemini returned no transcript/);
  assert.match(route, /text\.length > 12_000/);
});
