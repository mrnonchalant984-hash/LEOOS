import JSZip from 'jszip';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { validateIdeFiles } from '@/lib/ide-files';
import { GODOT_ASSET_MANIFEST_PATH, GODOT_PROJECT_ASSET_MAX_BYTES, GODOT_PROJECT_ASSET_MAX_COUNT, GODOT_PROJECT_ASSET_TOTAL_BYTES, validateGodotAssetPath, validateGodotImageBytes } from '@/lib/builders/godot-assets';

export const runtime = 'nodejs';
export const maxDuration = 60;

function serviceConfig() {
  const raw = process.env.GODOT_BUILD_SERVICE_URL?.trim();
  const token = process.env.GODOT_BUILD_SERVICE_TOKEN?.trim();
  if (!raw || !token) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return { base: url.toString().replace(/\/$/, ''), token };
  } catch { return null; }
}

function internalError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return internalError(401, 'Login required.');
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-cloud-build', 3, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const projectId = typeof body?.project_id === 'string' ? body.project_id : '';
  const preset = typeof body?.preset === 'string' ? body.preset.trim() : '';
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[A-Za-z0-9 _.-]{1,80}$/.test(preset) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return internalError(400, 'project_id, a configured export preset, and a UUID idempotency_key are required.');
  }
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!planAllowsCloudProject(plan, 'game', owner)) {
    return NextResponse.json({ error: 'Game builds are not included in your current plan. The owner must first configure an eligible higher-tier entitlement.', upgrade_url: '/pricing' }, { status: 403 });
  }
  const service = serviceConfig();
  if (!service) return internalError(503, 'Godot build service is not configured with a valid HTTPS endpoint and server token.');

  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,project_name,type,files').eq('id', projectId).eq('user_id', ctx.user.id).maybeSingle();
  if (projectError) return internalError(503, 'Project ownership could not be checked.');
  if (!project) return internalError(404, 'Project not found.');
  if (project.type !== 'game') return internalError(400, 'Only a saved game project can be built by Godot.');
  const files = project.files;
  if (!validateIdeFiles(files) || !files['project.godot']) return internalError(422, 'Save a valid Godot project.godot and project files before building.');
  if (Object.keys(files).some(path => /^\.env(?:\.|$)/i.test(path) || /\.(?:pem|key)$/i.test(path))) return internalError(400, 'Remove environment files and private keys from the project before building.');

  const { data: assetLinks, error: assetLinksError } = await db.from('godot_project_assets')
    .select('asset_id,project_path,sha256').eq('project_id', projectId).eq('owner_user_id', ctx.user.id).limit(GODOT_PROJECT_ASSET_MAX_COUNT);
  if (assetLinksError) return internalError(503, 'Game asset metadata is unavailable. Apply the Godot project assets migration before building.');
  if (assetLinks?.length && files[GODOT_ASSET_MANIFEST_PATH]) return internalError(400, 'Remove the reserved Godot asset manifest file before building.');
  const projectAssets: Array<{ path: string; mime_type: string; size_bytes: number; sha256: string; bytes: Buffer }> = [];
  let assetBytes = 0;
  if (assetLinks?.length) {
    const assetIds = assetLinks.map(link => link.asset_id);
    const { data: assets, error: assetsError } = await db.from('media_assets')
      .select('id,user_id,bucket,storage_path,kind,mime_type,size_bytes').eq('user_id', ctx.user.id).in('id', assetIds);
    if (assetsError || !assets || assets.length !== assetLinks.length) return internalError(503, 'Attached game asset metadata could not be verified.');
    const byId = new Map(assets.map(asset => [asset.id, asset]));
    for (const link of assetLinks) {
      const path = validateGodotAssetPath(link.project_path);
      const asset = byId.get(link.asset_id);
      if (!path || !asset || asset.bucket !== 'leo-files' || asset.kind !== 'image' ||
          !asset.storage_path.startsWith(`godot-projects/${ctx.user.id}/${projectId}/`) ||
          !Number.isSafeInteger(Number(asset.size_bytes)) || Number(asset.size_bytes) < 1 || Number(asset.size_bytes) > GODOT_PROJECT_ASSET_MAX_BYTES ||
          !/^[a-f0-9]{64}$/.test(link.sha256)) {
        return internalError(422, 'An attached game image has invalid metadata. Remove it and upload it again.');
      }
      const { data: blob, error: downloadError } = await db.storage.from(asset.bucket).download(asset.storage_path);
      if (downloadError || !blob) return internalError(503, 'An attached game image could not be retrieved from private storage.');
      const bytes = Buffer.from(await blob.arrayBuffer());
      const verified = validateGodotImageBytes(link.project_path, asset.mime_type, bytes);
      if (!verified || verified.sha256 !== link.sha256 || verified.sizeBytes !== Number(asset.size_bytes)) {
        return internalError(422, 'An attached game image failed its content, size, or checksum validation.');
      }
      assetBytes += bytes.byteLength;
      projectAssets.push({ path: link.project_path, mime_type: verified.mimeType, size_bytes: verified.sizeBytes, sha256: verified.sha256, bytes });
    }
  }
  if (projectAssets.length > GODOT_PROJECT_ASSET_MAX_COUNT || assetBytes > GODOT_PROJECT_ASSET_TOTAL_BYTES) {
    return internalError(413, 'Game assets exceed the project size limit.');
  }

  let capabilityResponse: Response;
  try {
    capabilityResponse = await fetch(`${service.base}/v1/capabilities`, { headers: { Authorization: `Bearer ${service.token}` }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  } catch { return internalError(503, 'Godot build service did not respond to its capability check.'); }
  if (!capabilityResponse.ok) return internalError(capabilityResponse.status === 401 ? 503 : 502, 'Godot build service authentication or readiness check failed.');
  const capability = await capabilityResponse.json().catch(() => null);
  if (capability?.ready !== true || !Array.isArray(capability.presets) || !capability.presets.includes(preset)) {
    return internalError(503, 'Godot service is not ready for this export preset.');
  }

  const started = await db.rpc('start_cloud_build_job', {
    p_owner_user_id: ctx.user.id,
    p_project_id: projectId,
    p_provider: 'godot-build-service',
    p_profile: preset,
    p_idempotency_key: idempotencyKey,
    p_monthly_limit: plan.limits.monthlyBuilds,
  });
  if (started.error) {
    const limited = started.error.message?.includes('Monthly build limit reached');
    return internalError(limited ? 429 : 400, limited ? 'Monthly build limit reached.' : 'Build job could not be authorized.');
  }
  const jobId = String(started.data?.[0]?.job_id || '');
  if (!jobId) return internalError(503, 'Build job was not persisted.');
  const { data: localJob } = await db.from('cloud_build_jobs').select('id,provider_job_id,status')
    .eq('id', jobId).eq('owner_user_id', ctx.user.id).maybeSingle();
  if (!localJob) return internalError(503, 'Build job record could not be loaded.');
  if (localJob.provider_job_id) return NextResponse.json({ job_id: jobId, status: localJob.status, deduplicated: true });

  const zip = new JSZip();
  for (const [path, contents] of Object.entries(files)) zip.file(path, contents, { createFolders: true });
  for (const asset of projectAssets) zip.file(asset.path, asset.bytes, { createFolders: true });
  if (projectAssets.length) {
    const manifest = projectAssets.map(({ path, mime_type, size_bytes, sha256 }) => ({ path, mime_type, size_bytes, sha256 }));
    zip.file(GODOT_ASSET_MANIFEST_PATH, JSON.stringify(manifest, null, 2), { createFolders: true });
  }
  let sourceZipBase64: string;
  try { sourceZipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } }); }
  catch { return internalError(500, 'Game project could not be packaged for the worker.'); }
  if (sourceZipBase64.length > 6_700_000) return internalError(413, 'Project archive exceeds the service request limit.');

  let remote: Response;
  try {
    remote = await fetch(`${service.base}/v1/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: ctx.user.id, projectId, preset, idempotencyKey: jobId, sourceZipBase64 }),
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    });
  } catch {
    await db.from('cloud_build_jobs').update({ status: 'failed', error: 'Godot service could not be reached.' }).eq('id', jobId).eq('owner_user_id', ctx.user.id);
    return internalError(502, 'Godot service could not be reached; the persisted job can be retried with the same idempotency key.');
  }
  const remoteBody = await remote.json().catch(() => null);
  if (!remote.ok || typeof remoteBody?.jobId !== 'string') {
    const failed = remote.status >= 500 || remote.status === 429;
    if (failed) await db.from('cloud_build_jobs').update({ status: 'failed', error: 'Godot service rejected or could not queue the build.' }).eq('id', jobId).eq('owner_user_id', ctx.user.id);
    return internalError(remote.status === 429 ? 429 : 502, typeof remoteBody?.error === 'string' ? remoteBody.error : 'Godot service could not queue this build.');
  }
  const { error: saveError } = await db.from('cloud_build_jobs').update({ provider_job_id: remoteBody.jobId, status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('owner_user_id', ctx.user.id);
  if (saveError) return internalError(503, 'Build is queued in the service but its status could not be synchronized. Retry with the same idempotency key.');
  return NextResponse.json({ job_id: jobId, status: remoteBody.status || 'queued', project_name: project.project_name }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
