import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Realtime audio is intentionally disabled until a Gemini audio path is verified. */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use voice chat.' }, { status: 401 });
  return NextResponse.json({
    error: 'Live Realtime voice is temporarily unavailable during the Gemini-only migration. Recording controls remain separate from transcription and speech synthesis.',
    code: 'GEMINI_AUDIO_WORKFLOW_NOT_VERIFIED',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
