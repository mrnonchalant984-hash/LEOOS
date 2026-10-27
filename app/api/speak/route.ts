import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const inputSchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();

function pcmToWav(pcm: Buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'speech-generation', 20, 3600);
  if (limited) return limited;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Text must be 1–4000 characters.' }, { status: 400 });
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return NextResponse.json({ error: 'Gemini speech is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.' }, { status: 503 });
  try {
    const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({
      model: process.env.LEO_GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-tts',
      contents: [{ role: 'user', parts: [{ text: parsed.data.text }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    });
    const part = response.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data);
    if (!part?.inlineData?.data) return NextResponse.json({ error: 'Gemini returned no audio. Verify that the configured Gemini model supports text-to-speech.' }, { status: 502 });
    const bytes = Buffer.from(part.inlineData.data, 'base64');
    const mime = part.inlineData.mimeType || '';
    const contentType = mime.includes('wav') ? 'audio/wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'audio/mpeg' : 'audio/wav';
    return new NextResponse(contentType === 'audio/wav' && !mime.includes('wav') ? pcmToWav(bytes) : bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Speech-Provider': 'google-gemini' } });
  } catch (error) {
    console.error('Gemini speech generation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Gemini speech generation failed. Check the configured Gemini TTS model and API access.' }, { status: 502 });
  }
}
