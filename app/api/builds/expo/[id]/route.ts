import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { expoMetadataFiles, parseEasJson, runEasCommand } from '@/lib/builders/expo-eas';
import { downloadExpoArtifact, expectedExpoArtifactType, verifyExpoArtifact } from '@/lib/builders/expo-artifact';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { withExpoProjectId } from '@/lib/builders/expo-provisioning';

export const runtime = 'nodejs';
export const maxDuration = 300;
const BUCKET = 'leo-files';
const ARTIFACT_RETENTION_DAYS = 30;

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  return value && typeof value === 'object' ? [value as Record<string, unknown>] : [];
}

function projectFiles(value: unknown): Record<string, string> | null {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(item => typeof item === 'string')
    ? value as Record<string, string> : null;
}

function buildData(value: unknown) {
  const root = objects(value)[0] || {};
  const build = objects(root.build)[0] || root;
  const raw = String(build.status || build.buildStatus || '').toUpperCase();
  const status = ['FINISHED', 'COMPLETED'].includes(raw) ? 'completed'
    : ['ERRORED', 'FAILED'].includes(raw) ? 'failed'
      : ['CANCELED', 'CANCELLED'].includes(raw) ? 'cancelled'
        : ['IN_PROGRESS', 'BUILDING', 'NEW', 'QUEUED'].includes(raw) ? 'building' : null;
  const artifacts = objects(build.artifacts)[0] || {};
  const artifact = [artifacts.buildUrl, artifacts.applicationArchiveUrl, build.artifactUrl]
    .find(item => typeof item === 'string' && item.startsWith('https://')) as string | undefined;
  const logs = Array.isArray(build.logFileUrls) ? build.logFileUrls.filter(item => typeof item === 'string' && item.startsWith('https://')) as string[] : [];
  return { build, status, artifact, logs };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build-status', 30, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,provider_project_id,status,profile,error,artifact_expected_type,artifact_storage_path,artifact_size_bytes,artifact_sha256,artifact_content_type,artifact_file_name,artifact_expires_at,created_at,updated_at')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build status could not be loaded.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  const publicJob = Object.fromEntries(Object.entries(job).filter(([key]) => !['provider_project_id', 'artifact_storage_path'].includes(key)));
  if (!job.provider_job_id) return NextResponse.json({ ...publicJob, artifact_available: false }, { headers: { 'Cache-Control': 'no-store' } });
  if (!job.provider_project_id) return NextResponse.json({ error: 'This legacy build has no persisted EAS project mapping. Start a new build to provision a verified project.' }, { status: 409 });
  if (job.status === 'completed' && job.artifact_storage_path && job.artifact_sha256 && job.artifact_expires_at) {
    const artifactAvailable = new Date(job.artifact_expires_at).getTime() > Date.now();
    return NextResponse.json({ ...publicJob, artifact_available: artifactAvailable,
      artifact_expired: !artifactAvailable,
      artifact_url: artifactAvailable ? `/api/builds/expo/${id}/artifact` : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const projectResult = await db.from('projects').select('files').eq('id', job.project_id).eq('user_id', ctx.user.id).maybeSingle();
  const files = projectFiles(projectResult.data?.files);
  if (projectResult.error || !files) return NextResponse.json({ error: 'Owned Expo project files could not be loaded.' }, { status: 503 });
  let result;
  try {
    result = await runEasCommand(expoMetadataFiles(withExpoProjectId(files, job.provider_project_id)), ['build:view', job.provider_job_id, '--json', '--non-interactive'], 30_000);
  } catch { return NextResponse.json({ error: 'Expo build status is temporarily unavailable.', job }, { status: 502 }); }
  if (result.code !== 0) return NextResponse.json({ error: 'Expo could not load this build status.', job }, { status: 502 });
  const state = buildData(parseEasJson(result.stdout));
  if (!state.status) return NextResponse.json({ error: 'Expo returned an unknown build status.', job }, { status: 502 });
  if (state.build.id !== job.provider_job_id) return NextResponse.json({ error: 'Expo returned a build record that does not match this LeonardX job.' }, { status: 502 });
  const now = new Date().toISOString();
  let persistedStatus = state.status;
  let artifactError: string | null = null;
  let artifactMetadata: Record<string, unknown> = {};
  if (state.status === 'completed') {
    if (!state.artifact) {
      persistedStatus = 'building';
      artifactError = 'Expo reports that the build finished, but no artifact is available yet. Poll status again shortly.';
    } else {
      let bytes: Buffer;
      try { bytes = await downloadExpoArtifact(state.artifact); }
      catch (error) {
        persistedStatus = 'building';
        artifactError = error instanceof Error ? error.message : 'The Expo artifact could not be downloaded. Poll status again to retry.';
        bytes = Buffer.alloc(0);
      }
      if (bytes.length) {
        const platform = String(job.profile).split(':')[0] === 'ios' ? 'ios' : 'android';
        const profile = String(job.profile).split(':')[1] === 'production' ? 'production' : 'preview';
        const storedType = job.artifact_expected_type;
        const artifactType = storedType === 'apk' || storedType === 'aab' || storedType === 'ipa'
          ? storedType
          : expectedExpoArtifactType(platform, profile, files);
        const verified = await verifyExpoArtifact(bytes, artifactType);
        if (!verified) {
          persistedStatus = 'failed';
          artifactError = `Expo returned an invalid ${artifactType.toUpperCase()} package. No artifact was stored.`;
        } else {
          const fileName = `leonardx-${id}.${verified.extension}`;
          const storagePath = `expo-artifacts/${ctx.user.id}/${fileName}`;
          const upload = await db.storage.from(BUCKET).upload(storagePath, bytes, {
            contentType: verified.contentType,
            upsert: true,
            cacheControl: '0',
          });
          if (upload.error) {
            persistedStatus = 'building';
            artifactError = 'The verified Expo artifact could not be stored in private storage. Check the leo-files bucket and poll status to retry.';
          } else {
            const expiresAt = new Date(Date.now() + ARTIFACT_RETENTION_DAYS * 86_400_000).toISOString();
            artifactMetadata = {
              artifact_storage_path: storagePath,
              artifact_size_bytes: verified.sizeBytes,
              artifact_sha256: verified.sha256,
              artifact_content_type: verified.contentType,
              artifact_file_name: fileName,
              artifact_expires_at: expiresAt,
              artifact_verified_at: now,
            };
            persistedStatus = 'completed';
            artifactError = null;
          }
        }
      }
    }
  }
  const terminal = ['completed', 'failed', 'cancelled'].includes(persistedStatus);
  const { error: updateError } = await db.from('cloud_build_jobs').update({
    status: persistedStatus,
    error: state.status === 'failed' ? 'Expo reported that this build failed. Review the provider logs URL.' : artifactError,
    updated_at: now,
    completed_at: terminal ? now : null,
    ...artifactMetadata,
  }).eq('id', id).eq('owner_user_id', ctx.user.id);
  if (updateError) return NextResponse.json({ error: 'Build status was read but could not be persisted.' }, { status: 503 });
  return NextResponse.json({ ...publicJob, status: persistedStatus, provider_status: state.status,
    error: state.status === 'failed' ? 'Expo reported that this build failed. Review the provider logs URL.' : artifactError,
    ...artifactMetadata,
    artifact_available: persistedStatus === 'completed',
    artifact_url: persistedStatus === 'completed' ? `/api/builds/expo/${id}/artifact` : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
