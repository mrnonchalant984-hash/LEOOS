import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('hosted Android worker has a real recurring trigger and serialized executions', async () => {
  const workflow = await read('.github/workflows/android-build-worker.yml');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /node scripts\/android-build-worker\.mjs/);
  assert.match(workflow, /sha256sum -c/);
});

test('hosted worker claims one job, verifies APK metadata and checksum, and uploads privately', async () => {
  const worker = await read('scripts/android-build-worker.mjs');
  assert.match(worker, /claim_android_build_job/);
  assert.match(worker, /heartbeat_android_build_job/);
  assert.match(worker, /finalize_android_build_job/);
  assert.match(worker, /for \(const key of \['PATH', 'HOME', 'JAVA_HOME', 'ANDROID_HOME'/);
  assert.match(worker, /Never pass Supabase credentials, GitHub credentials, or other worker secrets to Gradle/);
  assert.match(worker, /:app:assembleDebug/);
  assert.match(worker, /unzip/);
  assert.match(worker, /apksigner/);
  assert.match(worker, /aapt/);
  assert.match(worker, /com\\\.leonardx\\\.calculator/);
  assert.match(worker, /createHash\('sha256'\)/);
  assert.match(worker, /android-artifacts\/\$\{ownerId\}\/\$\{jobId\}-\$\{sha256\}\.apk/);
  assert.match(worker, /upsert: false/);
  assert.match(worker, /existingBytes\.length !== bytes\.length/);
  assert.match(worker, /attempt < 3/);
  assert.match(worker, /p_retry_at: retryAt/);
});

test('forward migration atomically finalizes only a live lease owned by the worker', async () => {
  const migration = await read('supabase/migrations/20261019180000_android_worker_reliability.sql');
  assert.match(migration, /started_at timestamptz/);
  assert.match(migration, /lease_expires_at is null or lease_expires_at < now\(\)/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_owner = p_worker/i);
  assert.match(migration, /lease_expires_at > now_at/i);
  assert.match(migration, /p_status not in \('completed','queued','failed'\)/);
  assert.match(migration, /attempts < 3/);
  assert.match(migration, /revoke all on function public\.finalize_android_build_job[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.finalize_android_build_job[\s\S]*to service_role/i);
});

test('Vercel worker refuses to claim jobs when its runtime lacks the Android toolchain', async () => {
  const route = await read('app/api/workers/android-build/route.ts');
  const implementation = await read('lib/android-build-worker.ts');
  assert.match(route, /getAndroidBuildCapabilities\(\)/);
  assert.match(route, /serverless runtime cannot compile Android APKs/);
  assert.match(route, /!capabilities\.localBuildable/);
  assert.match(implementation, /if \(!capabilities\.localBuildable\)/);
  const buildModule = await read('lib/android-build.ts');
  assert.match(buildModule, /if \(!capabilities\.localBuildable\) throw new Error/);
  assert.match(implementation, /before|toolchain is unavailable/);
});

test('authenticated artifact endpoint accepts immutable checksum paths while preserving legacy paths', async () => {
  const route = await read('app/api/builds/android/[id]/artifact/route.ts');
  assert.match(route, /getBuildActor\(request, 'mcp:read'\)/);
  assert.match(route, /eq\('owner_user_id', actor\.user\.id\)/);
  assert.match(route, /expectedImmutablePath/);
  assert.match(route, /verifyAndroidApk/);
  assert.match(route, /private, no-store/);
});


test('Android worker recovers a verified stored APK before recompiling the same job', async () => {
  const worker = await read('scripts/android-build-worker.mjs');
  assert.match(worker, /async function verifyStoredArtifact/);
  assert.match(worker, /storage\.from\(BUCKET\)\.list\(folder/);
  assert.match(worker, /storage\.from\(BUCKET\)\.download\(path\)/);
  assert.match(worker, /filenameHash && filenameHash !== sha256/);
  assert.match(worker, /recovered_existing_artifact: true/);
  assert.ok(worker.indexOf('verifyStoredArtifact(db, ownerId, jobId') < worker.indexOf("run('gradle', [':app:assembleDebug'"));
  assert.match(worker, /upsert: false/);
});

test('Android hosted worker does not modify or depend on Vercel Hobby cron schedules', async () => {
  const workflow = await read('.github/workflows/android-build-worker.yml');
  const vercel = JSON.parse(await read('vercel.json'));
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.ok(vercel.crons.every((cron) => !cron.path.includes('android-build')));
  assert.deepEqual(vercel.crons.map((cron) => cron.schedule), ['0 9 * * *', '0 10 * * *', '0 11 * * *', '0 12 * * *', '0 13 * * *', '0 14 * * *']);
});

test('application capabilities can represent a hosted worker without pretending Vercel has Android tools', async () => {
  const source = await read('lib/builders/application-capabilities.ts');
  assert.match(source, /ANDROID_HOSTED_WORKER_ENABLED/);
  assert.match(source, /operator declaration, not a live GitHub Actions health check/i);
});

test('worker preflight checks migration columns and private storage before claiming jobs', async () => {
  const workflow = await read('.github/workflows/android-build-worker.yml');
  const preflight = await read('scripts/android-worker-preflight.mjs');
  assert.match(workflow, /node scripts\/android-worker-preflight\.mjs/);
  assert.ok(workflow.indexOf('android-worker-preflight.mjs') < workflow.indexOf('node scripts/android-build-worker.mjs'));
  assert.match(preflight, /started_at/);
  assert.match(preflight, /db\.from\('android_build_jobs'\)\.select\(columns\)\.limit\(0\)/);
  assert.match(preflight, /getBucket\('leo-files'\)/);
  assert.match(preflight, /bucket\.public !== false/);
  assert.match(preflight, /secrets_exposed: false/);
  assert.match(preflight, /does not prove queue RPC execution or build success/);
});
