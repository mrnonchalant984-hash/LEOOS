import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede']);

/**
 * Vercel voice remains turn-based through /api/voice so speech turns share Main Chat's server-side
 * prompt, user memory, knowledge retrieval, approved tool registry and auth boundary.
 * Direct browser-to-Gemini Live tokens bypass that orchestration and are intentionally
 * not minted. This route does not issue the cookies or credentials expected by the
 * dormant Vercel WebSocket route.
 */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use voice chat.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-realtime-session', 5, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const requestedVoice = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).voice
    : undefined;
  const voice = typeof requestedVoice === 'string' && VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
  return NextResponse.json({
    mode: 'gemini_turn_based',
    status: 'ready',
    provider: 'google',
    voice,
    realtime: false,
    orchestration: 'shared-leo-chat',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
