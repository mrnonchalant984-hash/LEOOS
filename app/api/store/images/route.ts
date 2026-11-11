import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to upload product images.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-image-upload', 20, 3600);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be no larger than 6 MB.' }, { status: 413 });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Use a JPEG, PNG, or WebP image.' }, { status: 415 });
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000 || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) return NextResponse.json({ error: 'The image file is invalid or too large.' }, { status: 400 });
    const optimized = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const path = `${user.id}/${crypto.randomUUID()}.webp`;
    const { error } = await adminSupabase().storage.from('marketplace-products').upload(path, optimized, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) return NextResponse.json({ error: 'Image storage is unavailable.' }, { status: 503 });
    const { data } = adminSupabase().storage.from('marketplace-products').getPublicUrl(path);
    return NextResponse.json({ path, url: data.publicUrl, width: Math.min(metadata.width, 1800), height: Math.min(metadata.height, 1800) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Image could not be validated. Choose a standard image file.' }, { status: 400 });
  }
}
