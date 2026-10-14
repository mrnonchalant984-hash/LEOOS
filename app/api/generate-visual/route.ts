import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { generateAndPersistImage } from '@/lib/generation/images';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Please log in to generate visuals.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const mode = body?.mode === '3d' ? '3d' : body?.mode === 'diagram' ? 'diagram' : null;
  if (!mode) return NextResponse.json({ error: 'Choose a supported visual mode.' }, { status: 400 });
  if (prompt.length < 3 || prompt.length > 2000) return NextResponse.json({ error: 'Enter a visual prompt between 3 and 2,000 characters.' }, { status: 400 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'image-generation', 10, 60);
  if (limited) return limited;
  const requestKey = req.headers.get('idempotency-key') || (typeof body?.request_id === 'string' ? body.request_id : randomUUID());
  if (requestKey.length > 128 || /[\r\n]/.test(requestKey)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  try {
    const result = await generateAndPersistImage({ userId: ctx.user.id, prompt, mode, requestKey });
    return NextResponse.json({ ...result, kind: 'rendered_image', mode }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode: number }).statusCode) : 0;
    const message = error instanceof Error ? error.message : '';
    const isCredit = /credit|plan|subscription|entitled/i.test(message);
    return NextResponse.json({ error: isCredit ? message : status === 409 ? message : 'Visual generation is temporarily unavailable. Any reserved credits were returned when possible.' }, { status: status === 409 ? 409 : isCredit ? 402 : /migration|accounting/i.test(message) ? 503 : 502 });
  }
}
