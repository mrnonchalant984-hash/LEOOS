import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_MODEL = 'gemini-3.8-live';
const LIVE_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede']);
const LIVE_SYSTEM_INSTRUCTION = 'You are Leo, a concise and friendly voice assistant. Speak naturally and keep answers focused. Do not claim to have performed actions you did not perform.';

/** Mint a short-lived, single-use Gemini Live credential. The API key never leaves the server. */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use voice chat.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-realtime-session', 5, 3600);
  if (limited) return limited;
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'Gemini voice is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY on the server.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const body = await req.json().catch(() => null);
  const requestedVoice = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).voice
    : undefined;
  const voice = typeof requestedVoice === 'string' && LIVE_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
  const now = Date.now();
  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    systemInstruction: LIVE_SYSTEM_INSTRUCTION,
  };

  try {
    const client = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        expireTime: new Date(now + 5 * 60_000).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL, config: liveConfig },
      },
    });
    if (!token.name) throw new Error('live_token_missing');
    return NextResponse.json({
      mode: 'gemini_live',
      status: 'ready',
      provider: 'google',
      model: LIVE_MODEL,
      voice,
      token: token.name,
      apiVersion: 'v1alpha',
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      realtime: true,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Gemini Live token creation failed', {
      userId: auth.user.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Live voice could not be started. Check Gemini Live API access and try again.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
