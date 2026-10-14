import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { editAndPersistImage, ImageEditError } from '@/lib/generation/image-edit';
import { MAX_STUDIO_IMAGE_BYTES } from '@/lib/generation/image-input';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REQUEST_BYTES = MAX_STUDIO_IMAGE_BYTES + 64 * 1024;

export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to edit images.' }, { status: 401 });
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Choose an image no larger than 4 MB.' }, { status: 413 });
  }

  const limited = await enforceUserRateLimit(ctx.user.id, 'image-generation', 10, 60);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send a valid multipart image-edit request.' }, { status: 400 });
  }
  const prompt = formData.get('prompt');
  const image = formData.get('image');
  if (typeof prompt !== 'string' || !prompt.trim() || !(image instanceof File)) {
    return NextResponse.json({ error: 'Provide an image and an edit prompt.' }, { status: 400 });
  }
  if (image.size > MAX_STUDIO_IMAGE_BYTES) return NextResponse.json({ error: 'Choose an image no larger than 4 MB.' }, { status: 413 });

  const requestKey = request.headers.get('idempotency-key') || randomUUID();
  if (requestKey.length > 128 || /[\r\n]/.test(requestKey)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });

  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const result = await editAndPersistImage({
      userId: ctx.user.id,
      prompt: prompt.trim(),
      filename: image.name,
      mimeType: image.type,
      bytes,
      requestKey,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof ImageEditError ? error.statusCode : 502;
    const message = error instanceof ImageEditError
      ? error.message
      : 'Image editing is temporarily unavailable. Any reserved credits were returned when possible.';
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
