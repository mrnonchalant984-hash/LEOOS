import { NextRequest, NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { getProfile } from '@/lib/auth';
import { consumeCredit } from '@/lib/access';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Please log in to generate images.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 2000) {
    return NextResponse.json({ error: 'Enter an image prompt between 3 and 2,000 characters.' }, { status: 400 });
  }

  const limited = await enforceUserRateLimit(ctx.user.id, 'image-generation', 10, 60);
  if (limited) return limited;

  try {
    const usage = await consumeCredit(ctx.user.id, 'image_generation');
    const result = await getOpenAI().images.generate({
      model: process.env.LEO_IMAGE_MODEL || 'gpt-image-2',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });
    const url = result.data?.[0]?.url;
    if (!url) return NextResponse.json({ error: 'No image was returned. Please try again.' }, { status: 502 });
    const creditsRemaining = 'remaining' in usage ? usage.remaining : usage.credits;
    return NextResponse.json({ url, credits_remaining: creditsRemaining }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.toLowerCase().includes('credit') || message.toLowerCase().includes('plan') ? 402 : 502;
    return NextResponse.json({ error: status === 402 ? message : 'Image generation is temporarily unavailable.' }, { status });
  }
}
