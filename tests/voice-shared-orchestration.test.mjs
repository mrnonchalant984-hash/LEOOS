import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = readFileSync(new URL('../app/api/voice/route.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../app/api/realtime/session/route.ts', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('voice uses the shared Leo system prompt, memory and curated knowledge retrieval', () => {
  assert.match(voice, /getLeoSystemPrompt\(\)/);
  assert.match(voice, /from\('leo_memories'\)/);
  assert.match(voice, /retrieveLeoKnowledge\(transcript, 4\)/);
  assert.match(voice, /chats_v2/);
});

test('voice uses the existing account-scoped tool executor and supports agent execution', () => {
  assert.match(voice, /createUserAssistantTools\(ctx\.user\.id/);
  assert.match(voice, /generateTextWithTools/);
  assert.match(voice, /allowRepositoryAccess: asksRepository/);
  assert.match(voice, /allowAgentExecution: asksAgentRun/);
  assert.match(tools, /postAsUser\(options\.request, '\/api\/agents\/run'/);
});

test('browser voice sessions receive a constrained short-lived Gemini Live token', () => {
  assert.match(session, /mode: 'gemini_live'/);
  assert.match(session, /assistant: 'Bram'/);
  assert.match(session, /authTokens\.create/);
  assert.match(session, /liveConnectConstraints/);
  assert.match(session, /models\/\$\{model\}/);
  assert.match(session, /inputAudioTranscription/);
  assert.match(session, /outputAudioTranscription/);
  assert.match(session, /getLeoSystemPrompt\(\)/);
  assert.match(session, /leo_memories/);
});

test('voice UI no longer displays the obsolete Gemini quota and five-minute disclaimer', () => {
  assert.doesNotMatch(widget, /Voice audio streams to Google Gemini/);
  assert.doesNotMatch(widget, /Free-tier quotas may apply/);
  assert.doesNotMatch(widget, /Calls stop after five minutes/);
});


test('Leo voice uses the Gemini TTS model compatible with the configured generateContent audio response shape', () => {
  assert.match(voice, /LEO_GEMINI_TTS_MODEL\?\.trim\(\) \|\| 'gemini-3\.8-flash-tts'/);
  assert.match(voice, /responseModalities: \['AUDIO'\]/);
  assert.match(voice, /speechConfig:/);
});

test('realtime session setup reports infrastructure failures as an actionable 503 and logs the cause', () => {
  assert.match(session, /try \{/);
  assert.match(session, /Leo voice session setup failed/);
  assert.match(session, /status: 503/);
  const rateLimit = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8');
  assert.match(rateLimit, /consume_user_rate_limit failed/);
  assert.match(rateLimit, /consume_rate_limit_bucket/);
  assert.match(rateLimit, /primary\.error\.code === 'PGRST202' \|\| primary\.error\.code === '42883'/);
});


test('voice endpoint returns a structured transcript, Bram answer and playable speech payload', () => {
  assert.match(voice, /transcript,/);
  assert.match(voice, /assistantReply,/);
  assert.match(voice, /audio: \{ contentType: speech\.contentType, data: speech\.bytes\.toString\('base64'\) \}/);
  assert.match(voice, /NextResponse\.json\(/);
  assert.match(voice, /maxDuration = 60/);
});

test('Bram voice chat automatically detects speech pauses, displays both transcript turns and resumes listening', () => {
  assert.match(widget, /startHandsFreeVoiceLoop/);
  assert.match(widget, /captureHandsFreeVoiceTurn/);
  assert.match(widget, /silenceStartedAt/);
  assert.match(widget, /now - silenceStartedAt >= 1200/);
  assert.match(widget, /setMessages\(current => \[\.\.\.current, \{ role: "user", content: result\.transcript!/);
  assert.match(widget, /playback\.onended/);
  assert.match(widget, /speak naturally; Bram replies automatically/);
  assert.doesNotMatch(widget, /Stop speaking/);
});

test('voice endpoints default to the dedicated Gemini 3.5 transcription and 3.8 TTS models', async () => {
  const speak = readFileSync(new URL('../app/api/speak/route.ts', import.meta.url), 'utf8');
  const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(voice, /LEO_GEMINI_AUDIO_MODEL\?\.trim\(\) \|\| 'gemini-3\.5-transcribe'/);
  assert.match(voice, /LEO_GEMINI_TTS_MODEL\?\.trim\(\) \|\| 'gemini-3\.8-flash-tts'/);
  assert.match(speak, /LEO_GEMINI_TTS_MODEL\?\.trim\(\) \|\| 'gemini-3\.8-flash-tts'/);
  assert.match(env, /^LEO_GEMINI_LIVE_MODEL=gemini-3\.8-live$/m);
  assert.match(env, /^LEO_GEMINI_TRANSCRIBE_LIVE_MODEL=gemini-3\.5-transcribe-live$/m);
});
