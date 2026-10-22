import { NextRequest, NextResponse } from 'next/server';
import { getLeoSystemPrompt, getOpenAI, LEO_PLAN_TERMINOLOGY } from '@/lib/openai';
import { getProfile } from '@/lib/auth';
export const runtime = 'nodejs';
const validVoices = ['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'] as const;
export async function POST(req: NextRequest) {
  try {
    const auth = await getProfile(req);
    if (!auth) return NextResponse.json({ error: 'Please sign in to use live voice chat.' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const voice = typeof body.voice === 'string' && validVoices.includes(body.voice as typeof validVoices[number]) ? body.voice as typeof validVoices[number] : 'marin';
    const model = process.env.LEO_REALTIME_MODEL || 'gpt-realtime';
    const response = await getOpenAI().realtime.clientSecrets.create({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: { type: 'realtime', model, instructions: `${getLeoSystemPrompt()}\n\n${LEO_PLAN_TERMINOLOGY}\n\nYou are live Leo in LEO OS. Speak naturally, clearly and concisely.`, output_modalities: ['audio'], audio: { input: { turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true, threshold: 0.5, silence_duration_ms: 500, prefix_padding_ms: 300 } }, output: { voice } } },
    });
    return NextResponse.json({ client_secret: { value: response.value, expires_at: response.expires_at }, model, voice });
  } catch (error) {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      // Gemini turn-based voice is a safe fallback when realtime WebRTC cannot
      // be provisioned. The browser sends short recordings to /api/voice; no
      // Gemini API key is exposed to the client.
      return NextResponse.json({ mode: 'gemini_turn_based', voice: 'Kore', message: 'Live WebRTC is unavailable; Gemini voice chat is ready in turn-based mode.' });
    }
    console.error('Realtime session error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Unable to start live voice chat. Configure OpenAI Realtime or Gemini voice fallback.' }, { status: 503 });
  }
}
