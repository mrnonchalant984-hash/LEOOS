import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issues a short-lived credential for the dedicated Gemini streaming STT model.
 * The browser must connect using the returned token with API version v1alpha.
 * No long-lived Google API key is ever returned.
 */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use live transcription.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-live-transcription-session', 10, 3600);
  if (limited) return limited;

  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'Gemini transcription is not configured.' }, { status: 503 });

  try {
    const model = process.env.LEO_GEMINI_TRANSCRIBE_LIVE_MODEL?.trim() || 'gemini-3.5-transcribe-live';
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
      return NextResponse.json({ error: 'The configured live transcription model ID is invalid.' }, { status: 500 });
    }
    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();
    const client = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha', timeout: 20_000 } });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: 'v1alpha' },
        liveConnectConstraints: {
          model: `models/${model}`,
          config: {
            responseModalities: ['TEXT'],
            inputAudioTranscription: {},
            systemInstruction: 'Transcribe the user audio accurately. Return only the words spoken. Do not answer, summarize, or add commentary.',
          },
        },
      },
    });
    if (!token.name) throw new Error('Google did not return a live transcription token.');
    return NextResponse.json({
      mode: 'gemini_live_transcription',
      provider: 'google',
      token: token.name,
      model,
      realtime: true,
      transport: 'gemini-live-ephemeral-token',
      expires_at: expireTime,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Gemini live transcription session setup failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { error: 'Live transcription session could not be created. Verify model access, quota, and Google API configuration.' },
      { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } },
    );
  }
}
