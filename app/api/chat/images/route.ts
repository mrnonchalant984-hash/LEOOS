import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { inspectImageUpload, MAX_STUDIO_IMAGE_BYTES } from '@/lib/generation/image-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BUCKET = 'leo-files';
const MAX_REQUEST_BYTES = MAX_STUDIO_IMAGE_BYTES + 64 * 1024;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Sign in to attach images to Leo Chat.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-chat-image-upload', 12, 60);
  if (limited) return limited;
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Choose an image no larger than 4 MB.' }, { status: 413 });
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'Send a valid multipart image upload.' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  if (file.size < 1 || file.size > MAX_STUDIO_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Images must be between 1 byte and 4 MB.' }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = inspectImageUpload(bytes, file.type);
  if (!inspected) return NextResponse.json({ error: 'Use a valid PNG, JPEG, or WebP image.' }, { status: 415 });

  const db = adminSupabase();
  const assetId = randomUUID();
  const path = `chat-images/${auth.user.id}/${assetId}.${inspected.extension}`;
  const upload = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: inspected.mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: 'The image could not be saved to private storage.' }, { status: 502 });
  const inserted = await db.from('media_assets').insert({
    id: assetId,
    user_id: auth.user.id,
    kind: 'image',
    bucket: BUCKET,
    storage_path: path,
    mime_type: inspected.mimeType,
    size_bytes: bytes.length,
    metadata: { chat_image: true, file_name: file.name.slice(0, 180), source: 'chat_upload' },
  }).select('id').single();
  if (inserted.error || !inserted.data) {
    const cleanup = await db.storage.from(BUCKET).remove([path]);
    if (cleanup.error) console.error('Leo Chat image cleanup failed', { userId: auth.user.id, assetId });
    return NextResponse.json({ error: 'The image uploaded but its private asset record could not be created.' }, { status: 502 });
  }
  return NextResponse.json({
    image: { assetId, fileName: file.name.slice(0, 180), mimeType: inspected.mimeType, previewUrl: `/api/media/${encodeURIComponent(assetId)}?view=1` },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
