import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { generateAndPersistImage } from '@/lib/generation/images';

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
  const requestKey = req.headers.get('idempotency-key') || (typeof body?.request_id === 'string' ? body.request_id : randomUUID());
  if (requestKey.length > 128 || /[\r\n]/.test(requestKey)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  try {
    const result = await generateAndPersistImage({ userId: ctx.user.id, prompt, requestKey });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode: number }).statusCode) : 0;
    const message = error instanceof Error ? error.message : '';
    const isCredit = /credit|plan|subscription|entitled/i.test(message);
    const isSafeRecoveryMessage = /refund could not be confirmed|recovery could not be confirmed|hosted providers are disabled|configured model|text-capable|not configured|migration|accounting|image model|no image data|billing project/i.test(message);
    const responseStatus = [400, 409, 503].includes(status) ? status : isCredit ? 402 : /migration|accounting/i.test(message) ? 503 : 502;
    const publicMessage = isCredit || status === 400 || status === 409 || isSafeRecoveryMessage
      ? message
      : 'Image generation is temporarily unavailable. Check your saved assets before retrying.';
    return NextResponse.json({ error: publicMessage }, { status: responseStatus });
  }
}
