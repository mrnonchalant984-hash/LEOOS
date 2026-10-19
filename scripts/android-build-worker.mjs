import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

const BUCKET = 'leo-files';
const MAX_APK_BYTES = 150 * 1024 * 1024;
const SHA256_RE = /^[a-f0-9]{64}$/;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required worker configuration: ${name}.`);
  return value;
}

function safeProjectPath(relative) {
  if (typeof relative !== 'string' || !relative || relative.startsWith('/') || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || /^[A-Za-z]:/.test(relative)) return false;
  const absolute = resolve('/workspace', relative);
  return absolute.startsWith(`/workspace${sep}`);
}

function run(command, args, cwd, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'ignore', shell: false });
    child.once('error', () => reject(new Error(`Required build command could not start: ${command}.`)));
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Android build validation failed for ${command} (exit ${code ?? 'unknown'}).`)));
  });
}

function buildEnv() {
  const safe = {};
  for (const key of ['PATH', 'HOME', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_USER_HOME', 'ANDROID_PREFS_ROOT', 'GRADLE_USER_HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[key]) safe[key] = process.env[key];
  }
  // Never pass Supabase credentials, GitHub credentials, or other worker secrets to Gradle.
  return safe;
}

async function verifyStoredArtifact(db, ownerId, jobId, workspace, env) {
  const folder = `android-artifacts/${ownerId}`;
  const { data: objects, error: listError } = await db.storage.from(BUCKET).list(folder, {
    limit: 100,
    search: jobId,
  });
  if (listError) throw new Error('Private artifact recovery lookup failed; verify the leo-files bucket and worker credentials.');

  const candidates = (objects || []).filter((item) =>
    item && typeof item.name === 'string' &&
    (item.name === `${jobId}.apk` || new RegExp(`^${jobId}-[a-f0-9]{64}\\.apk$`).test(item.name))
  );
  for (const candidate of candidates) {
    const path = `${folder}/${candidate.name}`;
    const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(path);
    if (downloadError || !blob) continue;
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_APK_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) continue;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const filenameHash = candidate.name === `${jobId}.apk` ? null : candidate.name.slice(`${jobId}-`.length, -'.apk'.length);
    if (!SHA256_RE.test(sha256) || (filenameHash && filenameHash !== sha256)) continue;

    const apkPath = join(workspace, `recovered-${sha256}.apk`);
    await writeFile(apkPath, bytes, { flag: 'wx' });
    try {
      await run('unzip', ['-t', apkPath], workspace, env);
      const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
      const buildTools = join(sdkRoot, 'build-tools', '35.0.0');
      await run(join(buildTools, 'apksigner'), ['verify', '--verbose', apkPath], workspace, env);
      const badging = await readPackageBadging(join(buildTools, 'aapt'), apkPath, workspace, env);
      if (!/^package: name='com\.leonardx\.calculator'(?:\s|$)/m.test(badging)) continue;
    } catch {
      continue;
    }

    // Legacy artifacts are copied to a checksum-addressed immutable path before finalization.
    const immutablePath = `${folder}/${jobId}-${sha256}.apk`;
    if (path !== immutablePath) {
      const { error: uploadError } = await db.storage.from(BUCKET).upload(immutablePath, bytes, {
        contentType: 'application/vnd.android.package-archive', upsert: false, cacheControl: '0',
      });
      if (uploadError) {
        const { data: existing, error: existingError } = await db.storage.from(BUCKET).download(immutablePath);
        if (existingError || !existing) throw new Error('Recovered APK could not be preserved under its immutable checksum path.');
        const existingBytes = Buffer.from(await existing.arrayBuffer());
        if (createHash('sha256').update(existingBytes).digest('hex') !== sha256) {
          throw new Error('An immutable APK artifact path already contains different bytes.');
        }
      }
    }
    return { storagePath: immutablePath, sizeBytes: bytes.length, sha256 };
  }
  return null;
}

function readPackageBadging(aapt, apkPath, cwd, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(aapt, ['dump', 'badging', apkPath], { cwd, env, stdio: ['ignore', 'pipe', 'ignore'], shell: false });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 128 * 1024) child.kill(); });
    child.once('error', () => reject(new Error('Android package metadata validator could not start.')));
    child.once('exit', code => code === 0 ? resolvePromise(stdout) : reject(new Error('Android package metadata validation failed.')));
  });
}

async function writeProject(files, workspace) {
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length < 1 || Object.keys(files).length > 250) throw new Error('Calculator project source is missing or outside the supported file limit.');
  let totalBytes = 0;
  for (const [relative, content] of Object.entries(files)) {
    if (!safeProjectPath(relative) || typeof content !== 'string') throw new Error('Calculator project contains an invalid source path or file.');
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > 2 * 1024 * 1024) throw new Error('Calculator project source exceeds the 2 MB limit.');
    const target = resolve(workspace, relative);
    if (!target.startsWith(`${resolve(workspace)}${sep}`)) throw new Error('Calculator project source path escaped its workspace.');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  }
  const required = [
    'settings.gradle',
    'build.gradle',
    'app/build.gradle',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java/com/leonardx/calculator/MainActivity.java',
  ];
  for (const path of required) if (!Object.hasOwn(files, path)) throw new Error(`Calculator source is missing required file: ${path}.`);
  if (!files['app/build.gradle'].includes("applicationId 'com.leonardx.calculator'") || !files['app/src/main/java/com/leonardx/calculator/MainActivity.java'].includes('package com.leonardx.calculator')) {
    throw new Error('The persisted project is not the expected LeonardX Calculator application.');
  }
}

async function main() {
  const url = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const workerId = `github-actions-${requiredEnv('GITHUB_RUN_ID')}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const { data: claimed, error: claimError } = await db.rpc('claim_android_build_job', { p_worker: workerId });
  if (claimError) throw new Error('Android job claim failed. Verify that the worker queue migration is applied and the worker database secrets point to the production project.');
  const job = Array.isArray(claimed) ? claimed[0] : null;
  if (!job) {
    console.log(JSON.stringify({ claimed: false, status: 'idle' }));
    return;
  }
  console.log(JSON.stringify({ claimed: true, job_id: job.id, attempts: job.attempts }));

  const jobId = String(job.id);
  const ownerId = String(job.owner_user_id);
  const projectId = String(job.project_id || '');
  let heartbeatBusy = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      const { data, error } = await db.rpc('heartbeat_android_build_job', { p_job_id: jobId, p_worker: workerId, p_progress: 35 });
      if (error || data !== true) console.error('Android worker heartbeat was not accepted; the job may have lost its lease.');
    } catch {
      console.error('Android worker heartbeat failed; lease recovery will handle interruption.');
    } finally {
      heartbeatBusy = false;
    }
  }, 60_000);
  heartbeat.unref?.();

  let workspace;
  try {
    if (!projectId) throw new Error('The persisted Android build job has no attached project.');
    const { data: project, error: projectError } = await db.from('projects').select('id,files')
      .eq('id', projectId).eq('user_id', ownerId).maybeSingle();
    if (projectError || !project) throw new Error('The job-owned calculator project could not be loaded.');

    workspace = await mkdtemp(join(tmpdir(), 'leonardx-android-worker-'));
    const env = buildEnv();
    const recovered = await verifyStoredArtifact(db, ownerId, jobId, workspace, env);
    if (recovered) {
      const { data: finalized, error: finalizeError } = await db.rpc('finalize_android_build_job', {
        p_job_id: jobId, p_worker: workerId, p_status: 'completed',
        p_storage_path: recovered.storagePath, p_size_bytes: recovered.sizeBytes,
        p_sha256: recovered.sha256, p_error: null, p_retry_at: null,
      });
      if (finalizeError || finalized !== true) throw new Error('The recovered verified APK could not be committed because the worker lease was lost or finalization failed.');
      await db.from('projects').update({ status: 'completed', progress: 100 }).eq('id', projectId).eq('user_id', ownerId);
      console.log(JSON.stringify({ job_id: jobId, status: 'completed', recovered_existing_artifact: true, size_bytes: recovered.sizeBytes, sha256: recovered.sha256 }));
      return;
    }

    if (!project.files || typeof project.files !== 'object') throw new Error('The source for the job-owned calculator project could not be loaded.');
    await db.from('projects').update({ status: 'building', progress: 35 }).eq('id', projectId).eq('user_id', ownerId);
    const projectWorkspace = join(workspace, 'project');
    await writeProject(project.files, projectWorkspace);
    await run('gradle', [':app:assembleDebug', '--no-daemon', '--stacktrace'], projectWorkspace, env);

    const apkPath = join(projectWorkspace, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const bytes = await readFile(apkPath);
    if (!bytes.length || bytes.length > MAX_APK_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Gradle did not produce a non-empty APK archive within the size limit.');
    await run('unzip', ['-t', apkPath], projectWorkspace, env);
    const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    const buildTools = join(sdkRoot, 'build-tools', '35.0.0');
    await run(join(buildTools, 'apksigner'), ['verify', '--verbose', apkPath], projectWorkspace, env);
    const badging = await readPackageBadging(join(buildTools, 'aapt'), apkPath, projectWorkspace, env);
    if (!/^package: name='com\.leonardx\.calculator'(?:\s|$)/m.test(badging)) throw new Error('The APK package ID does not match com.leonardx.calculator.');

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!SHA256_RE.test(sha256)) throw new Error('APK SHA-256 validation failed.');
    const { data: leaseAlive, error: heartbeatError } = await db.rpc('heartbeat_android_build_job', { p_job_id: jobId, p_worker: workerId, p_progress: 85 });
    if (heartbeatError || leaseAlive !== true) throw new Error('The Android build lease expired before artifact upload.');
    await db.from('projects').update({ status: 'building', progress: 85 }).eq('id', projectId).eq('user_id', ownerId);
    const storedPath = `android-artifacts/${ownerId}/${jobId}-${sha256}.apk`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(storedPath, bytes, {
      contentType: 'application/vnd.android.package-archive', upsert: false, cacheControl: '0',
    });
    if (uploadError) {
      const { data: existing, error: existingError } = await db.storage.from(BUCKET).download(storedPath);
      if (existingError || !existing) throw new Error('Verified APK upload to private leo-files storage failed. Check bucket privacy, storage quota, and worker credentials.');
      const existingBytes = Buffer.from(await existing.arrayBuffer());
      if (existingBytes.length !== bytes.length || createHash('sha256').update(existingBytes).digest('hex') !== sha256) throw new Error('The immutable APK path already contains different bytes.');
    }

    const { data: finalized, error: finalizeError } = await db.rpc('finalize_android_build_job', {
      p_job_id: jobId,
      p_worker: workerId,
      p_status: 'completed',
      p_storage_path: storedPath,
      p_size_bytes: bytes.length,
      p_sha256: sha256,
      p_error: null,
      p_retry_at: null,
    });
    if (finalizeError || finalized !== true) throw new Error('The verified APK could not be committed because the worker lease was lost or finalization failed.');
    await db.from('projects').update({ status: 'completed', progress: 100 }).eq('id', projectId).eq('user_id', ownerId);
    console.log(JSON.stringify({ job_id: jobId, status: 'completed', recovered_existing_artifact: false, size_bytes: bytes.length, sha256 }));
  } catch (error) {
    const attempt = Number(job.attempts) || 1;
    const retry = attempt < 3;
    const retryAt = retry ? new Date(Date.now() + Math.min(15 * 60_000, 60_000 * (2 ** (attempt - 1)))).toISOString() : null;
    const publicError = error instanceof Error ? error.message.slice(0, 400) : 'Android build failed for an unknown reason.';
    const { data: finalized, error: finalizeError } = await db.rpc('finalize_android_build_job', {
      p_job_id: jobId,
      p_worker: workerId,
      p_status: retry ? 'queued' : 'failed',
      p_storage_path: null,
      p_size_bytes: null,
      p_sha256: null,
      p_error: publicError,
      p_retry_at: retryAt,
    });
    if (finalizeError || finalized !== true) console.error('Build failed and its state could not be finalized; the database lease will provide crash recovery.');
    if (projectId) {
      await db.from('projects').update({ status: retry ? 'building' : 'failed', progress: retry ? 5 : 0 })
        .eq('id', projectId).eq('user_id', ownerId);
    }
    console.error(JSON.stringify({ job_id: jobId, status: retry ? 'queued' : 'failed', error: publicError }));
    if (!retry) process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Android worker initialization failed.';
  console.error(message.slice(0, 500));
  process.exitCode = 1;
});
