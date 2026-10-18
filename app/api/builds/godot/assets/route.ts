import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { GODOT_PROJECT_ASSET_MAX_BYTES, validateGodotAssetPath, validateGodotImageBytes } from '@/lib/builders/godot-assets';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = 'leo-files';
const MAX_REQUEST_BYTES = GODOT_PROJECT_ASSET_MAX_BYTES + 100_000;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function ownedGameProject(projectId: string, userId: string) {
  return adminSupabase().from('projects').select('id,type').eq('id', projectId).eq('user_id', userId).maybeSingle();
}

async function cleanupUnlinkedAsset(db: ReturnType<typeof adminSupabase>, userId: string, assetId: string) {
  const { count, error: linksError } = await db.from('godot_project_assets').select('id', { count: 'exact', head: true }).eq('asset_id', assetId);
  if (linksError || (count || 0) > 0) return;
  const { data: asset } = await db.from('media_assets').select('bucket,storage_path,metadata')
    .eq('id', assetId).eq('user_id', userId).eq('bucket', BUCKET).maybeSingle();
  if (!asset || asset.metadata?.origin !== 'godot_project_asset') return;
  const { error } = await db.storage.from(BUCKET).remove([asset.storage_path]);
  if (!error) await db.from('media_assets').delete().eq('id', assetId).eq('user_id', userId);
}

export async function GET(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return json(401, { error: 'Login required.' });
  const projectId = req.nextUrl.searchParams.get('project_id') || '';
  if (!UUID.test(projectId)) return json(400, { error: 'A valid game project_id is required.' });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-project-assets-read', 60, 3600);
  if (limited) return limited;
  const { data: project, error: projectError } = await ownedGameProject(projectId, ctx.user.id);
  if (projectError) return json(503, { error: 'Game project ownership could not be checked.' });
  if (!project || project.type !== 'game') return json(404, { error: 'Game project not found.' });

  const db = adminSupabase();
  const { data: links, error } = await db.from('godot_project_assets').select('asset_id,project_path,sha256,created_at')
    .eq('project_id', projectId).eq('owner_user_id', ctx.user.id).order('created_at', { ascending: true }).limit(20);
  if (error) return json(503, { error: 'Game assets are not available. Apply the Godot project assets migration first.' });
  const ids = (links || []).map(link => link.asset_id);
  if (!ids.length) return json(200, { assets: [] });
  const { data: records, error: assetError } = await db.from('media_assets')
    .select('id,mime_type,size_bytes').eq('user_id', ctx.user.id).in('id', ids);
  if (assetError) return json(503, { error: 'Game asset metadata could not be loaded.' });
  const byId = new Map((records || []).map(asset => [asset.id, asset]));
  return json(200, { assets: (links || []).flatMap(link => {
    const asset = byId.get(link.asset_id);
    if (!asset || !validateGodotAssetPath(link.project_path)) return [];
    return [{ asset_id: link.asset_id, path: link.project_path, mime_type: asset.mime_type, size_bytes: asset.size_bytes, sha256: link.sha256 }];
  }) });
}

export async function POST(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return json(401, { error: 'Login required.' });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-project-asset-upload', 20, 3600);
  if (limited) return limited;
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_REQUEST_BYTES) {
    return json(413, { error: 'Image uploads must be smaller than 2 MB.' });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json(400, { error: 'Provide a multipart image upload.' }); }
  const projectId = String(form.get('project_id') || '');
  const projectPath = String(form.get('path') || '');
  const file = form.get('file');
  const destination = validateGodotAssetPath(projectPath);
  if (!UUID.test(projectId) || !destination || !(file instanceof File)) {
    return json(400, { error: 'Provide a valid game project, assets/ image path, and image file.' });
  }
  if (file.size < 1 || file.size > GODOT_PROJECT_ASSET_MAX_BYTES || (file.type && file.type !== destination.mimeType)) {
    return json(400, { error: 'Use a PNG, JPEG, or WebP image up to 2 MB that matches its target path extension.' });
  }

  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!planAllowsCloudProject(plan, 'game', owner)) return json(403, { error: 'Game assets require a plan with game project access.' });
  const db = adminSupabase();
  const { data: project, error: projectError } = await ownedGameProject(projectId, ctx.user.id);
  if (projectError) return json(503, { error: 'Game project ownership could not be checked.' });
  if (!project || project.type !== 'game') return json(404, { error: 'Game project not found.' });

  let bytes: Buffer;
  try { bytes = Buffer.from(await file.arrayBuffer()); } catch { return json(400, { error: 'Image upload could not be read.' }); }
  const verified = validateGodotImageBytes(projectPath, destination.mimeType, bytes);
  if (!verified) return json(400, { error: 'The image content does not match its PNG, JPEG, or WebP file type or size.' });

  const assetId = randomUUID();
  const storagePath = `godot-projects/${ctx.user.id}/${projectId}/${assetId}${verified.extension}`;
  const { data: previousLink, error: previousLinkError } = await db.from('godot_project_assets').select('asset_id')
    .eq('project_id', projectId).eq('owner_user_id', ctx.user.id).eq('project_path', projectPath).maybeSingle();
  if (previousLinkError) return json(503, { error: 'Game asset metadata is unavailable. Apply the Godot project assets migration first.' });
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: verified.mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return json(503, { error: 'Private game asset storage is unavailable.' });

  const { error: recordError } = await db.from('media_assets').insert({
    id: assetId,
    user_id: ctx.user.id,
    kind: 'image',
    bucket: BUCKET,
    storage_path: storagePath,
    mime_type: verified.mimeType,
    size_bytes: verified.sizeBytes,
    metadata: { origin: 'godot_project_asset', project_id: projectId, project_path: projectPath, sha256: verified.sha256 },
  });
  if (recordError) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return json(503, { error: 'Game asset metadata could not be saved.' });
  }

  const { error: attachError } = await db.rpc('attach_godot_project_asset', {
    p_owner_user_id: ctx.user.id,
    p_project_id: projectId,
    p_asset_id: assetId,
    p_project_path: projectPath,
    p_sha256: verified.sha256,
  });
  if (attachError) {
    await db.storage.from(BUCKET).remove([storagePath]);
    await db.from('media_assets').delete().eq('id', assetId).eq('user_id', ctx.user.id);
    const isCapacity = /asset (count|size) limit reached/i.test(attachError.message || '');
    return json(isCapacity ? 413 : 503, { error: isCapacity ? attachError.message : 'Game asset could not be attached. Apply the Godot project assets migration and verify private storage.' });
  }
  if (previousLink?.asset_id && previousLink.asset_id !== assetId) await cleanupUnlinkedAsset(db, ctx.user.id, previousLink.asset_id);
  return json(201, { asset: { path: projectPath, mime_type: verified.mimeType, size_bytes: verified.sizeBytes, sha256: verified.sha256 } });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return json(401, { error: 'Login required.' });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-project-asset-delete', 20, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const projectId = typeof body?.project_id === 'string' ? body.project_id : '';
  const projectPath = validateGodotAssetPath(body?.path);
  if (!UUID.test(projectId) || !projectPath) return json(400, { error: 'Provide a valid game project_id and attached asset path.' });
  const { data: project, error: projectError } = await ownedGameProject(projectId, ctx.user.id);
  if (projectError) return json(503, { error: 'Game project ownership could not be checked.' });
  if (!project || project.type !== 'game') return json(404, { error: 'Game project not found.' });
  const { data, error } = await adminSupabase().from('godot_project_assets').delete()
    .eq('project_id', projectId).eq('owner_user_id', ctx.user.id).eq('project_path', projectPath.path).select('asset_id').maybeSingle();
  if (error) return json(503, { error: 'Game asset could not be detached.' });
  if (!data) return json(404, { error: 'Game asset was not found.' });
  await cleanupUnlinkedAsset(adminSupabase(), ctx.user.id, data.asset_id);
  return json(200, { removed: true, path: projectPath.path });
}
