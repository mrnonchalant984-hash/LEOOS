/** Live Gemini acceptance smoke. Requires an explicit staging API key and a short WAV test clip. */
import { readFileSync, statSync } from 'node:fs';
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const imageModel = process.env.LEO_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const audioModel = process.env.LEO_GEMINI_AUDIO_MODEL || 'gemini-2.5-flash';
const audioPath = process.env.LEONARDX_TEST_AUDIO_FILE;
if (process.env.LEONARDX_LIVE_TESTS !== 'true') {
  console.error('Set LEONARDX_LIVE_TESTS=true to explicitly enable billable live Gemini smoke tests.'); process.exit(2);
}
if (!key) { console.error('GEMINI_API_KEY or GOOGLE_API_KEY is required.'); process.exit(2); }
if (!audioPath || statSync(audioPath).size > 5 * 1024 * 1024) {
  console.error('Set LEONARDX_TEST_AUDIO_FILE to a <=5 MB WAV/WebM audio clip.'); process.exit(2);
}
const results = [];
async function call(model, body) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.status || 'provider_error'}`);
  return payload;
}
try {
  const image = await call(imageModel, { contents: [{ role: 'user', parts: [{ text: 'Create a simple blue geometric abstract icon on a plain white background.' }] }], generationConfig: { responseModalities: ['IMAGE'] } });
  const imageParts = (image.candidates || []).flatMap(c => c.content?.parts || []).filter(p => p.inlineData?.mimeType?.startsWith('image/'));
  results.push({ name: 'gemini_image_generation', ok: imageParts.length > 0, model: imageModel, image_parts: imageParts.length });
} catch (error) { results.push({ name: 'gemini_image_generation', ok: false, model: imageModel, error: error.message }); }
try {
  const audio = readFileSync(audioPath);
  const mimeType = audioPath.toLowerCase().endsWith('.webm') ? 'audio/webm' : 'audio/wav';
  const transcription = await call(audioModel, { contents: [{ role: 'user', parts: [
    { text: 'Transcribe the spoken words in this audio. Return only the transcript.' },
    { inlineData: { mimeType, data: audio.toString('base64') } },
  ] }] });
  const transcript = (transcription.candidates || []).flatMap(c => c.content?.parts || []).map(p => p.text || '').join(' ').trim();
  results.push({ name: 'gemini_audio_input', ok: Boolean(transcript), model: audioModel, transcript_chars: transcript.length });
} catch (error) { results.push({ name: 'gemini_audio_input', ok: false, model: audioModel, error: error.message }); }
console.log(JSON.stringify({ mode: 'live-gemini-staging-smoke', timestamp: new Date().toISOString(), results }, null, 2));
if (results.some(r => !r.ok)) process.exitCode = 1;
