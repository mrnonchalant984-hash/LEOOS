import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
const BUCKET = 'leo-files';
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };
type Ctx = { params: Promise<{ id: string }> };

function validBytes(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png') return bytes.length > 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if (mime === 'image/jpeg') return bytes.length > 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if (mime === 'image/webp') return bytes.length > 12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (mime === 'audio/mpeg') return bytes.length > 3 && (bytes[0]===73&&bytes[1]===68&&bytes[2]===51 || bytes[0]===255&&(bytes[1]&224)===224);
  if (mime === 'audio/ogg') return bytes.length > 4 && String.fromCharCode(...bytes.slice(0,4))==='OggS';
  if (mime === 'audio/wav') return bytes.length > 12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WAVE';
  return false;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', id).eq('user_id', ctx.user.id).eq('type', 'game').maybeSingle();
  if (projectError) return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  if (!project) return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  const { data: assets, error } = await db.from('media_assets').select('id,kind,mime_type,size_bytes,storage_path,created_at,metadata').eq('user_id', ctx.user.id).eq('bucket', BUCKET).contains('metadata', { project_id: id }).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Project assets could not be loaded.' }, { status: 503 });
  const results = await Promise.all((assets || []).map(async asset => {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(asset.storage_path, 3600);
    return { id: asset.id, name: String(asset.metadata?.original_name || 'Asset'), kind: asset.kind, mime_type: asset.mime_type, size_bytes: asset.size_bytes, url: signed?.signedUrl || null, path: String(asset.metadata?.project_path || ''), created_at: asset.created_at };
  }));
  return NextResponse.json({ assets: results }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', id).eq('user_id', ctx.user.id).eq('type', 'game').maybeSingle();
  if (projectError) return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  if (!project) return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Upload a valid multipart file.' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image or audio asset.' }, { status: 400 });
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Assets must be between 1 byte and 8 MB.' }, { status: 413 });
  const ext = MIME_EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'Supported assets: PNG, JPEG, WebP, MP3, OGG and WAV. SVG/HTML/script uploads are blocked.' }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validBytes(bytes, file.type)) return NextResponse.json({ error: 'The file signature does not match its declared media type.' }, { status: 415 });
  const assetId = randomUUID();
  const storagePath = `browser-game-assets/${ctx.user.id}/${id}/${assetId}.${ext}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (uploadError) return NextResponse.json({ error: 'Asset upload failed. Verify the private leo-files storage bucket and quota.' }, { status: 503 });
  const { data: asset, error: insertError } = await db.from('media_assets').insert({
    id: assetId, user_id: ctx.user.id, job_id: null, kind: file.type.startsWith('image/') ? 'image' : 'audio', bucket: BUCKET,
    storage_path: storagePath, mime_type: file.type, size_bytes: file.size,
    metadata: { project_id: id, project_path: `assets/${assetId}.${ext}`, original_name: file.name.replace(/[\u0000-\u001f]/g, '').slice(0, 160), source: 'browser_game_studio' },
  }).select('id,kind,mime_type,size_bytes,created_at,metadata').single();
  if (insertError || !asset) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'Asset metadata could not be saved. The uploaded object was rolled back.' }, { status: 503 });
  }
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return NextResponse.json({ asset: { id: asset.id, name: asset.metadata?.original_name, kind: asset.kind, mime_type: asset.mime_type, size_bytes: asset.size_bytes, url: signed?.signedUrl || null, path: String(asset.metadata?.project_path || ''), created_at: asset.created_at } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const assetId = req.nextUrl.searchParams.get('asset_id') || '';
  const db = adminSupabase();
  const { data: project } = await db.from('projects').select('id').eq('id', id).eq('user_id', ctx.user.id).eq('type', 'game').maybeSingle();
  if (!project) return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  const { data: asset, error } = await db.from('media_assets').select('id,storage_path').eq('id', assetId).eq('user_id', ctx.user.id).eq('bucket', BUCKET).contains('metadata', { project_id: id }).maybeSingle();
  if (error) return NextResponse.json({ error: 'Asset metadata could not be loaded.' }, { status: 503 });
  if (!asset) return NextResponse.json({ error: 'Asset not found in this project.' }, { status: 404 });
  const { error: removeError } = await db.storage.from(BUCKET).remove([asset.storage_path]);
  if (removeError) return NextResponse.json({ error: 'Asset storage could not be removed.' }, { status: 503 });
  const { error: deleteError } = await db.from('media_assets').delete().eq('id', asset.id).eq('user_id', ctx.user.id);
  if (deleteError) return NextResponse.json({ error: 'Stored asset was removed, but metadata cleanup failed.' }, { status: 503 });
  return NextResponse.json({ deleted: true });
}
