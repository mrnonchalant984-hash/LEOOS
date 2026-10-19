import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalculatorAndroidProject, getAndroidBuildCapabilities, verifyAndroidApk } from '../lib/android-build.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('Android capability check fails closed when the toolchain is not configured', () => {
  const result = getAndroidBuildCapabilities({ PATH: '', JAVA_HOME: '', GRADLE_HOME: '', ANDROID_HOME: '' });
  assert.equal(result.buildable, false);
  assert.match(result.missing.join(' '), /Java/);
  assert.match(result.missing.join(' '), /Gradle/);
  assert.match(result.missing.join(' '), /Android SDK/);
});

test('calculator starter is a real Android project with required operations', () => {
  const files = createCalculatorAndroidProject();
  assert.match(files['app/build.gradle'], /assemble|com\.android\.application/);
  assert.match(files['app/src/main/AndroidManifest.xml'], /MAIN/);
  for (const digit of '0123456789') assert.match(files['app/src/main/java/com/leonardx/calculator/MainActivity.java'], new RegExp(`"${digit}"`));
  assert.match(files['app/src/main/java/com/leonardx/calculator/MainActivity.java'], /÷|division|ArithmeticException/);
  assert.match(files['app/src/main/java/com/leonardx/calculator/MainActivity.java'], /Double|decimal|\./);
});

test('APK verification rejects bad signatures, wrong lengths, and checksum changes', () => {
  const apk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  const hash = createHash('sha256').update(apk).digest('hex');
  assert.equal(verifyAndroidApk(apk, apk.length, hash), true);
  assert.equal(verifyAndroidApk(apk, apk.length + 1, hash), false);
  assert.equal(verifyAndroidApk(Buffer.from('not an apk'), 10, hash), false);
  assert.equal(verifyAndroidApk(Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 4]), 7, hash), false);
});

test('Android download endpoint checks authenticated ownership and stored checksum', async () => {
  const route = await readFile(new URL('../app/api/builds/android/[id]/artifact/route.ts', import.meta.url), 'utf8');
  assert.match(route, /getBuildActor\(request, 'mcp:read'\)/);
  assert.match(route, /eq\('owner_user_id', actor\.user\.id\)/);
  assert.match(route, /android-artifacts/);
  assert.match(route, /verifyAndroidApk/);
  assert.match(route, /private, no-store/);
});

test('Android build requests enqueue jobs and worker uses an expiring database lease', async () => {
  const enqueue = await readFile(new URL('../app/api/builds/android/route.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../app/api/workers/android-build/route.ts', import.meta.url), 'utf8');
  const implementation = await readFile(new URL('../lib/android-build-worker.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261019120000_android_build_worker_queue.sql', import.meta.url), 'utf8');
  assert.match(enqueue, /status: 'queued'/);
  assert.match(enqueue, /reply\(202/);
  assert.doesNotMatch(enqueue, /buildAndroidApk\(/);
  assert.match(worker, /ANDROID_BUILD_WORKER_SECRET/);
  assert.match(worker, /timingSafeEqual/);
  assert.match(implementation, /claim_android_build_job/);
  assert.match(implementation, /heartbeat_android_build_job/);
  assert.match(implementation, /verifyAndroidApk/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /attempts >= 3/);
  assert.match(migration, /advisory_xact_lock/);
  assert.match(migration, /set public = false/i);
  assert.match(migration, /file_size_limit/i);
});

test('Android deployment image pins and verifies its toolchain', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile.android', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  assert.match(dockerfile, /node:22-bookworm/);
  assert.match(dockerfile, /openjdk-17-jdk/);
  assert.match(dockerfile, /gradle-8\.9-bin\.zip/);
  assert.match(dockerfile, /platforms;android-35/);
  assert.match(dockerfile, /sha256sum -c/);
  assert.match(dockerfile, /sdkmanager --licenses/);
  assert.match(ignore, /^\.env\.\*/m);
});
