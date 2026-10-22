import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getOpenAI, getLeoSystemPrompt, LEO_PLAN_TERMINOLOGY } from '@/lib/openai';
import { generateText } from '@/lib/ai/provider-registry';
import { generateWithExplicitFallback, getSafeFallbackModel } from '@/lib/ai/provider-fallback';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs';

const googleKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
function pcmToWav(pcm: Buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
async function geminiTranscribe(audio: File) {
  const key = googleKey();
  if (!key) throw new Error('Gemini is not configured.');
  const bytes = Buffer.from(await audio.arrayBuffer());
  const client = new GoogleGenAI({ apiKey: key });
  const response = await client.models.generateContent({
    model: process.env.LEO_GEMINI_AUDIO_MODEL?.trim() || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: audio.type || 'audio/webm', data: bytes.toString('base64') } },
      { text: 'Transcribe the spoken words accurately. Return only the transcript, without commentary.' },
    ] }],
  });
  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty transcript.');
  return text;
}
async function geminiSpeak(text: string) {
  const key = googleKey();
  if (!key) throw new Error('Gemini is not configured.');
  const client = new GoogleGenAI({ apiKey: key });
  const response = await client.models.generateContent({
    model: process.env.LEO_GEMINI_TTS_MODEL?.trim() || 'gemini-2.5-flash-preview-tts',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  });
  const audioPart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data);
  if (!audioPart?.inlineData?.data) throw new Error('Gemini text-to-speech returned no audio.');
  const raw = Buffer.from(audioPart.inlineData.data, 'base64');
  const mime = audioPart.inlineData.mimeType || '';
  if (mime.includes('wav')) return { bytes: raw, contentType: 'audio/wav' };
  if (mime.includes('mpeg') || mime.includes('mp3')) return { bytes: raw, contentType: 'audio/mpeg' };
  return { bytes: pcmToWav(raw), contentType: 'audio/wav' };
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Please sign in to use voice features.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'leo-voice', 10, 60);
  if (limited) return limited;
  try {
    const fd = await req.formData();
    const audio = fd.get('audio');
    if (!(audio instanceof File)) return NextResponse.json({ error: 'Audio file required' }, { status: 400 });
    let transcript = '';
    let transcriptionProvider = 'google';
    try { transcript = await geminiTranscribe(audio); }
    catch (error) {
      if (!process.env.OPENAI_API_KEY && !process.env.LEO_API_KEY) throw error;
      transcriptionProvider = 'openai';
      transcript = (await getOpenAI().audio.transcriptions.create({ file: audio, model: process.env.LEO_TRANSCRIPTION_MODEL || 'whisper-1' })).text;
    }
    const turnMode = fd.get('mode') === 'chat';
    let assistantReply = '';
    if (turnMode) {
      const primaryModel = googleKey() ? (process.env.LEO_FALLBACK_MODEL?.trim() && process.env.LEO_FALLBACK_MODEL.trim().startsWith('google/') ? process.env.LEO_FALLBACK_MODEL.trim() : 'google/gemini-2.5-flash') : 'openai/gpt-4o-mini';
      const configuredFallback = process.env.LEO_FALLBACK_MODEL?.trim();
      const fallbackPreference = configuredFallback && !configuredFallback.startsWith('google/') ? configuredFallback : 'openai/gpt-4o-mini';
      const fallbackModel = getSafeFallbackModel(primaryModel, fallbackPreference);
      const outcome = await generateWithExplicitFallback(primaryModel, fallbackModel, model => generateText({
        model,
        messages: [
          { role: 'system', content: `${getLeoSystemPrompt()}\n\n${LEO_PLAN_TERMINOLOGY}\n\nYou are Leo in voice chat. Answer naturally and concisely. Never claim to have completed actions without tool confirmation.` },
          { role: 'user', content: transcript },
        ],
        maxOutputTokens: 700,
      }));
      assistantReply = outcome.result.text || 'I could not form a response to that. Please try again.';
    }
    const speechText = turnMode ? assistantReply : transcript;
    let speech: { bytes: Buffer; contentType: string };
    let speechProvider = 'google';
    try { speech = await geminiSpeak(speechText); }
    catch (error) {
      if (!process.env.OPENAI_API_KEY && !process.env.LEO_API_KEY) throw error;
      speechProvider = 'openai';
      const output = await getOpenAI().audio.speech.create({ model: process.env.LEO_TTS_MODEL || 'tts-1', voice: 'alloy', input: speechText });
      speech = { bytes: Buffer.from(await output.arrayBuffer()), contentType: 'audio/mpeg' };
    }
    return new NextResponse(new Uint8Array(speech.bytes), { headers: { 'Content-Type': speech.contentType, 'X-Transcript': encodeURIComponent(transcript), 'X-Assistant-Reply': encodeURIComponent(assistantReply), 'X-Transcription-Provider': transcriptionProvider, 'X-Speech-Provider': speechProvider, 'X-Cache-Control': 'no-store', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Voice processing failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Voice processing is temporarily unavailable. Check Gemini/OpenAI provider configuration and model access.' }, { status: 502 });
  }
}
