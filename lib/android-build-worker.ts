import 'server-only';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { adminSupabase } from '@/lib/auth';
import { buildAndroidApk, getAndroidBuildCapabilities, verifyAndroidApk } from '@/lib/android-build';

const BUCKET = 'leo-files';
const MAX_APK_BYTES = 150 * 1024 * 1024;

/** Claims at most one durable job, runs the real Gradle build, and commits a verified artifact. */
export async function runAndroidBuildWorker(workerId: string) {
  const capabilities = getAndroidBuildCapabilities();
  if (!capabilities.buildable) {
    throw new Error(`Android worker toolchain is unavailable: ${capabilities.missing.join(', ')}. Use the configured hosted Android queue worker.`);
  }
  const db = adminSupabase();
  const { data: claimed, error: claimError } = await db.rpc('claim_android_build_job', { p_worker: workerId });
  if (claimError) throw new Error('Android build queue could not be claimed. Apply the Android worker migration.');
  const job = Array.isArray(claimed) ? claimed[0] : null;
  if (!job) return { claimed: false as const };

  const jobId = String(job.id);
  const ownerId = String(job.owner_user_id);
  const projectId = String(job.project_id || '');
  if (!projectId) {
    await finalizeJob(db, jobId, workerId, 'failed', 'The persisted Android job has no project to build.');
    return { claimed: true as const, job_id: jobId, status: 'failed' as const };
  }

  const { data: project, error: projectError } = await db.from('projects').select('id,files')
    .eq('id', projectId).eq('user_id', ownerId).maybeSingle();
  if (projectError || !project || !project.files || typeof project.files !== 'object') {
    await finalizeJob(db, jobId, workerId, 'failed', 'The owned Android project source could not be loaded.');
    return { claimed: true as const, job_id: jobId, status: 'failed' as const };
  }

  const heartbeat = setInterval(() => {
    void db.rpc('heartbeat_android_build_job', { p_job_id: jobId, p_worker: workerId, p_progress: 35 });
  }, 60_000);
  heartbeat.unref?.();
  try {
    await db.from('projects').update({ status: 'building', progress: 20 }).eq('id', projectId).eq('user_id', ownerId);
    const result = await buildAndroidApk(project.files as Record<string, string>);
    const bytes = await readFile(result.apkPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length > MAX_APK_BYTES || !verifyAndroidApk(bytes, result.sizeBytes, result.sha256) || sha256 !== result.sha256) {
      throw new Error('The generated APK failed signature, size, or SHA-256 validation.');
    }

    const storagePath = `android-artifacts/${ownerId}/${jobId}-${sha256}.apk`;
    const upload = await db.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/vnd.android.package-archive', upsert: true, cacheControl: '0',
    });
    if (upload.error) throw new Error('Private APK artifact storage failed. Verify the private leo-files bucket and quota.');

    const { data: completed, error: completeError } = await db.rpc('finalize_android_build_job', {
      p_job_id: jobId, p_worker: workerId, p_status: 'completed', p_storage_path: storagePath,
      p_size_bytes: bytes.length, p_sha256: sha256, p_error: null, p_retry_at: null,
    });
    if (completeError || completed !== true) {
      throw new Error('The build lease was lost before the verified artifact could be committed.');
    }
    await db.from('projects').update({ status: 'completed', progress: 100 }).eq('id', projectId).eq('user_id', ownerId);
    return { claimed: true as const, job_id: jobId, status: 'completed' as const, size_bytes: bytes.length, sha256 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Android build failed.';
    const attempt = Math.max(1, Number(job.attempts) || 1);
    const retry = attempt < 3;
    const retryAt = retry ? new Date(Date.now() + Math.min(15 * 60_000, 60_000 * (2 ** (attempt - 1)))).toISOString() : null;
    const finalized = await finalizeJob(db, jobId, workerId, retry ? 'queued' : 'failed', message.slice(0, 500), retryAt);
    if (finalized && projectId) {
      await db.from('projects').update({ status: retry ? 'building' : 'failed', progress: retry ? 5 : 0 }).eq('id', projectId).eq('user_id', ownerId);
    }
    return { claimed: true as const, job_id: jobId, status: retry ? 'queued' as const : 'failed' as const, error: message.slice(0, 500) };
  } finally {
    clearInterval(heartbeat);
  }
}

async function finalizeJob(
  db: ReturnType<typeof adminSupabase>, jobId: string, workerId: string,
  status: 'queued' | 'failed', message: string, retryAt?: string | null,
) {
  const { data, error } = await db.rpc('finalize_android_build_job', {
    p_job_id: jobId, p_worker: workerId, p_status: status, p_storage_path: null,
    p_size_bytes: null, p_sha256: null, p_error: message.slice(0, 500), p_retry_at: retryAt || null,
  });
  return !error && data === true;
}
