import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { requireVerifiedStoreSeller } from '@/lib/store/seller-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_OPTIMIZED_BYTES = 700 * 1024;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to upload product images.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id);
  if (sellerAccess) return sellerAccess;
  const limited = await enforceUserRateLimit(user.id, 'store-image-upload', 20, 3600);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be no larger than 2 MB.' }, { status: 413 });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Use a JPEG, PNG, or WebP image.' }, { status: 415 });
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000 || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) return NextResponse.json({ error: 'The image file is invalid or too large.' }, { status: 400 });
    let optimized = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
    if (optimized.byteLength > MAX_OPTIMIZED_BYTES) {
      optimized = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 58 }).toBuffer();
    }
    if (optimized.byteLength > MAX_OPTIMIZED_BYTES) return NextResponse.json({ error: 'This image could not be compressed small enough. Choose a simpler image.' }, { status: 413 });
    const path = `${user.id}/${crypto.randomUUID()}.webp`;
    const { error } = await adminSupabase().storage.from('marketplace-products').upload(path, optimized, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) return NextResponse.json({ error: 'Image storage is unavailable.' }, { status: 503 });
    const { data } = adminSupabase().storage.from('marketplace-products').getPublicUrl(path);
    return NextResponse.json({ path, url: data.publicUrl, width: Math.min(metadata.width, 1200), height: Math.min(metadata.height, 1200), sizeBytes: optimized.byteLength }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Image could not be validated. Choose a standard image file.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to remove product images.' }, { status: 401 });
  const sellerAccess = await requireVerifiedStoreSeller(user.id);
  if (sellerAccess) return sellerAccess;
  const body = await request.json().catch(() => null) as { paths?: unknown } | null;
  if (!Array.isArray(body?.paths) || body.paths.length > 8
    || body.paths.some(path => typeof path !== 'string' || !new RegExp(`^${user.id}/[0-9a-f-]{36}\\.webp$`, 'i').test(path))) {
    return NextResponse.json({ error: 'Invalid image cleanup request.' }, { status: 400 });
  }
  const paths = [...new Set(body.paths as string[])];
  if (!paths.length) return NextResponse.json({ removed: 0 });
  const db = adminSupabase();
  const { data: listings, error: listingError } = await db.from('marketplace_products').select('image_paths').eq('seller_id', user.id);
  if (listingError) return NextResponse.json({ error: 'Image references could not be checked.' }, { status: 503 });
  const inUse = new Set((listings ?? []).flatMap(listing => listing.image_paths ?? []));
  const removable = paths.filter(path => !inUse.has(path));
  if (removable.length) {
    const { error } = await db.storage.from('marketplace-products').remove(removable);
    if (error) return NextResponse.json({ error: 'Unused image files could not be removed.' }, { status: 503 });
  }
  return NextResponse.json({ removed: removable.length, retained: paths.length - removable.length });
}
