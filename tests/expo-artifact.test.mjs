import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { downloadExpoArtifact, downloadExpoBuildLogs, expectedExpoArtifactType, verifyExpoArtifact } from '../lib/builders/expo-artifact.ts';

async function archive(entries) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('verifies APK and AAB entry signatures and rejects unrelated ZIP or HTML bytes', async () => {
  const apk = await archive({ 'AndroidManifest.xml': 'manifest', 'classes.dex': 'dex' });
  const aab = await archive({ 'BundleConfig.pb': 'bundle', 'base/manifest/AndroidManifest.xml': 'manifest' });
  const other = await archive({ 'index.html': '<h1>not an app</h1>' });
  assert.ok(await verifyExpoArtifact(apk, 'apk'));
  assert.ok(await verifyExpoArtifact(aab, 'aab'));
  assert.equal(await verifyExpoArtifact(apk, 'aab'), null);
  assert.equal(await verifyExpoArtifact(Buffer.from('<html>APK</html>'), 'apk'), null);
  assert.equal(await verifyExpoArtifact(other, 'apk'), null);
});

test('selects artifact type from platform and EAS build profile', () => {
  const files = { 'eas.json': JSON.stringify({ build: { preview: { android: { buildType: 'apk' } }, production: { android: { buildType: 'app-bundle' } } } }) };
  assert.equal(expectedExpoArtifactType('android', 'preview', files), 'apk');
  assert.equal(expectedExpoArtifactType('android', 'production', files), 'aab');
  assert.equal(expectedExpoArtifactType('ios', 'production', files), 'ipa');
});

test('downloads only bounded HTTPS artifacts and refuses unsafe redirects', async () => {
  const bytes = await archive({ 'AndroidManifest.xml': 'manifest', 'classes.dex': 'dex' });
  const downloaded = await downloadExpoArtifact('https://storage.example.test/build.apk', async () =>
    new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } }));
  assert.deepEqual(downloaded, bytes);
  await assert.rejects(downloadExpoArtifact('http://storage.example.test/build.apk'), /unsafe artifact URL/);
  await assert.rejects(downloadExpoArtifact('https://storage.example.test/build.apk', async () =>
    new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } })), /unsafe URL/);
});

test('Expo artifact downloads require owner-scoped, unexpired metadata and verify stored bytes', async () => {
  const route = await readFile(new URL('../app/api/builds/expo/[id]/artifact/route.ts', import.meta.url), 'utf8');
  const status = await readFile(new URL('../app/api/builds/expo/[id]/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261019140000_expo_cloud_build_artifacts.sql', import.meta.url), 'utf8');
  assert.match(route, /getBuildActor\(req, 'mcp:read'\)/);
  assert.match(route, /eq\('owner_user_id', ctx\.user\.id\)/);
  assert.match(route, /artifact_expires_at/);
  assert.match(route, /artifact_storage_path !== expectedPath/);
  assert.match(route, /verifyExpoArtifact\(bytes, extension\)/);
  assert.match(route, /checksum !== job\.artifact_sha256/);
  assert.match(status, /provider_project_id/);
  assert.match(status, /artifact_verified_at/);
  assert.match(migration, /artifact_sha256/);
  assert.match(migration, /artifact_expires_at/);
});

test('expired Expo artifact cleanup requires CRON_SECRET and is scheduled daily', async () => {
  const cleanup = await readFile(new URL('../app/api/cron/build-artifacts/route.ts', import.meta.url), 'utf8');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.match(cleanup, /request\.headers\.get\('authorization'\) === `Bearer \$\{secret\}`/);
  assert.match(cleanup, /storage\.from\('leo-files'\)\.remove/);
  assert.ok(vercel.crons.some(item => item.path === '/api/cron/build-artifacts' && item.schedule === '0 14 * * *'));
});

test('retrieves EAS log text with credential-shaped values redacted', async () => {
  const logs = await downloadExpoBuildLogs('https://logs.example.test/build.log', async () =>
    new Response('EXPO_TOKEN=private-value\nError: Gradle task failed'));
  assert.match(logs, /EXPO_TOKEN=\[REDACTED\]/);
  assert.match(logs, /Gradle task failed/);
});

test('EAS logs endpoint reads provider logFileUrls for the exact owned build ID', async () => {
  const route = await readFile(new URL('../app/api/builds/expo/[id]/logs/route.ts', import.meta.url), 'utf8');
  assert.match(route, /eq\('owner_user_id', actor\.user\.id\)/);
  assert.match(route, /build\.logFileUrls/);
  assert.match(route, /build\.id !== job\.provider_job_id/);
  assert.match(route, /downloadExpoBuildLogs/);
});