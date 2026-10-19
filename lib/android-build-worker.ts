import 'server-only';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { adminSupabase } from '@/lib/auth';
import { buildAndroidApk, verifyAndroidApk } from '@/lib/android-build';

const BUCKET = 'leo-files';
const MAX_APK_BYTES = 150 * 1024 * 1024;

/** Claims at most one durable job, runs the real Gradle build, and commits a verified artifact. */
export async function runAndroidBuildWorker(workerId: string) {
  const db = adminSupabase();
  const { data: claimed, error: claimError } = await db.rpc('claim_android_build_job', { p_worker: workerId });
  if (claimError) throw new Error('Android build queue could not be claimed. Apply the Android worker migration.');
  const job = Array.isArray(claimed) ? claimed[0] : null;
  if (!job) return { claimed: false as const };

  const jobId = String(job.id);
  const ownerId = String(job.owner_user_id);
  const projectId = String(job.project_id || '');
  if (!projectId) {
    await failJob(db, jobId, workerId, 'The persisted Android job has no project to build.');
    return { claimed: true as const, job_id: jobId, status: 'failed' as const };
  }

  const { data: project, error: projectError } = await db.from('projects').select('id,files')
    .eq('id', projectId).eq('user_id', ownerId).maybeSingle();
  if (projectError || !project || !project.files || typeof project.files !== 'object') {
    await failJob(db, jobId, workerId, 'The owned Android project source could not be loaded.');
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

    const storagePath = `android-artifacts/${ownerId}/${jobId}.apk`;
    const upload = await db.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/vnd.android.package-archive', upsert: true, cacheControl: '0',
    });
    if (upload.error) throw new Error('Private APK artifact storage failed. Verify the private leo-files bucket and quota.');

    const now = new Date().toISOString();
    const { data: completed, error: completeError } = await db.from('android_build_jobs').update({
      status: 'completed', progress: 100, storage_path: storagePath, size_bytes: bytes.length,
      sha256, error: null, lease_owner: null, lease_expires_at: null,
      updated_at: now, completed_at: now,
    }).eq('id', jobId).eq('status', 'building').eq('lease_owner', workerId).select('id').maybeSingle();
    if (completeError || !completed) {
      throw new Error('The build lease was lost before the verified artifact could be committed.');
    }
    await db.from('projects').update({ status: 'completed', progress: 100 }).eq('id', projectId).eq('user_id', ownerId);
    return { claimed: true as const, job_id: jobId, status: 'completed' as const, size_bytes: bytes.length, sha256 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Android build failed.';
    const retry = Number(job.attempts) < 3;
    if (retry) {
      await db.from('android_build_jobs').update({
        status: 'queued', progress: 0, error: message.slice(0, 500), lease_owner: null,
        lease_expires_at: null, available_at: new Date(Date.now() + 60_000 * Number(job.attempts)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).eq('status', 'building').eq('lease_owner', workerId);
      await db.from('projects').update({ status: 'building', progress: 5 }).eq('id', projectId).eq('user_id', ownerId);
    } else {
      await failJob(db, jobId, workerId, message.slice(0, 500));
      await db.from('projects').update({ status: 'failed' }).eq('id', projectId).eq('user_id', ownerId);
    }
    return { claimed: true as const, job_id: jobId, status: retry ? 'queued' as const : 'failed' as const, error: message.slice(0, 500) };
  } finally {
    clearInterval(heartbeat);
  }
}

async function failJob(db: ReturnType<typeof adminSupabase>, jobId: string, workerId: string, message: string) {
  await db.from('android_build_jobs').update({ status: 'failed', error: message, lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('status', 'building').eq('lease_owner', workerId);
}
