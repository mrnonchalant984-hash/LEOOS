import { NextRequest, NextResponse } from 'next/server';
import { getOpenAI, LEO_SYSTEM_PROMPT } from '@/lib/openai';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

const validVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;

export async function POST(req: NextRequest) {
  try {
    const auth = await getProfile(req);
    if (!auth) {
      return NextResponse.json({ error: 'Please sign in to use live voice chat.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const selectedVoice = typeof body.voice === 'string' && validVoices.includes(body.voice as (typeof validVoices)[number])
      ? body.voice as (typeof validVoices)[number]
      : 'marin';
    const model = typeof body.model === 'string' ? body.model : 'gpt-realtime';

    const response = await getOpenAI().realtime.clientSecrets.create({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model,
        instructions: `${LEO_SYSTEM_PROMPT}\n\nYou are live Leo in the LEO OS voice interface. Speak naturally, briefly, and clearly. Keep responses useful, professional, and conversational.`,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
              threshold: 0.5,
              silence_duration_ms: 500,
              prefix_padding_ms: 300,
            },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: selectedVoice,
          },
        },
      },
    });

    return NextResponse.json({
      client_secret: {
        value: response.value,
        expires_at: response.expires_at,
      },
      expires_at: response.expires_at,
      model,
      instructions: LEO_SYSTEM_PROMPT,
      voice: selectedVoice,
    });
  } catch (error: unknown) {
    console.error('Realtime session error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start live voice chat.' },
      { status: 500 },
    );
  }
}
