import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = 'leo-files';

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
  const isDownload = request.nextUrl.searchParams.get('download') === '1';
  const { data: signed, error: signError } = await db.storage.from(asset.bucket).createSignedUrl(
    asset.storage_path,
    60 * 60,
    isDownload ? { download: true } : undefined,
  );
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: 'A secure asset URL could not be created.' }, { status: 502 });
  if (isDownload || request.nextUrl.searchParams.get('view') === '1') {
    return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.json({ id: asset.id, url: signed.signedUrl, mime_type: asset.mime_type, url_expires_in: 3600 }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const user = await getProfile(request);
  if (!user) return NextResponse.json({ error: 'Sign in to delete this image.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.user.id, 'media-asset-delete', 20, 60);
  if (limited) return limited;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Image was not found.' }, { status: 404 });

  const db = adminSupabase();
  const { data: asset, error: assetError } = await db.from('media_assets')
    .select('id,job_id,bucket,storage_path,kind')
    .eq('id', id).eq('user_id', user.user.id).maybeSingle();
  if (assetError) return NextResponse.json({ error: 'Image ownership could not be checked.' }, { status: 503 });
  if (!asset || asset.kind !== 'image' || asset.bucket !== BUCKET || !asset.job_id) {
    return NextResponse.json({ error: 'Generated image was not found.' }, { status: 404 });
  }

  const { data: job, error: jobError } = await db.from('generation_jobs')
    .select('id,job_type,status,metadata')
    .eq('id', asset.job_id).eq('user_id', user.user.id).maybeSingle();
  if (jobError) return NextResponse.json({ error: 'Image generation record could not be checked.' }, { status: 503 });
  if (!job || job.job_type !== 'image' || job.status !== 'completed' || job.metadata?.asset_id !== asset.id) {
    return NextResponse.json({ error: 'Generated image was not found.' }, { status: 404 });
  }

  const { error: storageError } = await db.storage.from(asset.bucket).remove([asset.storage_path]);
  if (storageError) return NextResponse.json({ error: 'Image storage could not be removed. The image is still available; retry deletion.' }, { status: 502 });

  const { data: deleted, error: deleteError } = await db.from('media_assets').delete()
    .eq('id', asset.id).eq('user_id', user.user.id).select('id').maybeSingle();
  if (deleteError || !deleted) {
    return NextResponse.json({ error: 'The image file was removed, but its library record could not be finalized. Retry deletion.' }, { status: 503 });
  }

  const metadata = { ...(job.metadata || {}), asset_deleted_at: new Date().toISOString() };
  delete metadata.asset_id;
  delete metadata.storage_path;
  delete metadata.mime_type;
  delete metadata.size_bytes;
  const { error: historyError } = await db.from('generation_jobs').update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('user_id', user.user.id);
  if (historyError) {
    console.error('Deleted image history could not be updated', { assetId: asset.id, jobId: job.id, error: historyError.message });
    return NextResponse.json({
      deleted: true,
      warning: 'The image was deleted, but its history entry could not be updated.',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  return NextResponse.json({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
