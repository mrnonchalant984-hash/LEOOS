import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const LIMIT = 6 * 1024 * 1024;
export async function POST(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to attach a file.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-message-attachment', 10, 3600); if (limited) return limited;
  const { id } = await context.params; const db = adminSupabase();
  const { data: conversation } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id,blocked_by').eq('id', id).maybeSingle();
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (conversation.blocked_by) return NextResponse.json({ error: 'Messaging is unavailable for this conversation.' }, { status: 403 });
  const form = await request.formData().catch(() => null); const file = form?.get('file');
  if (!(file instanceof File) || file.size < 1 || file.size > LIMIT) return NextResponse.json({ error: 'Choose a file no larger than 6 MB.' }, { status: 413 });
  const source = Buffer.from(await file.arrayBuffer()); let payload = source; let contentType = 'application/pdf'; let extension = 'pdf';
  if (file.type.startsWith('image/')) {
    try {
      const meta = await sharp(source, { limitInputPixels: 30_000_000, failOn: 'error' }).metadata();
      if (!meta.width || !meta.height || meta.width > 6000 || meta.height > 6000 || !['jpeg','png','webp'].includes(meta.format ?? '')) return NextResponse.json({ error: 'Use a valid JPEG, PNG, WebP or PDF file.' }, { status: 415 });
      payload = await sharp(source, { limitInputPixels: 30_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); contentType = 'image/webp'; extension = 'webp';
    } catch { return NextResponse.json({ error: 'Image could not be validated.' }, { status: 400 }); }
  } else if (file.type !== 'application/pdf' || source.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'Use a valid JPEG, PNG, WebP or PDF file.' }, { status: 415 });
  const path = `${id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from('marketplace-private').upload(path, payload, { contentType, upsert: false });
  return error ? NextResponse.json({ error: 'Private file storage is unavailable.' }, { status: 503 }) : NextResponse.json({ path, contentType }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
