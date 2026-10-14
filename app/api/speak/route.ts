import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getOpenAI } from '@/lib/openai';

export const runtime = 'nodejs';
const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const inputSchema = z.object({ text: z.string().trim().min(1).max(4000), voice: z.enum(voices).default('alloy') }).strict();

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'speech-generation', 20, 3600);
  if (limited) return limited;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Text must be 1–4000 characters and voice must be supported.' }, { status: 400 });
  try {
    const speech = await getOpenAI().audio.speech.create({ model: 'tts-1', voice: parsed.data.voice, input: parsed.data.text });
    return new NextResponse(Buffer.from(await speech.arrayBuffer()), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Speech generation is unavailable. Check the configured provider and try again.' }, { status: 503 });
  }
}
