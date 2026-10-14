import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getProfile(request);
  if (!user) return NextResponse.json({ error: 'Sign in to access this asset.' }, { status: 401 });
  const { id } = await context.params;
  const db = adminSupabase();
  const { data: asset, error } = await db.from('media_assets')
    .select('id,user_id,bucket,storage_path,mime_type,created_at')
    .eq('id', id).eq('user_id', user.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Asset metadata is unavailable.' }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  const { data: signed, error: signError } = await db.storage.from(asset.bucket).createSignedUrl(asset.storage_path, 60 * 60);
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: 'A secure asset URL could not be created.' }, { status: 502 });
  if (request.nextUrl.searchParams.get('download') === '1') return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
  return NextResponse.json({ id: asset.id, url: signed.signedUrl, mime_type: asset.mime_type, url_expires_in: 3600 }, { headers: { 'Cache-Control': 'private, no-store' } });
}
