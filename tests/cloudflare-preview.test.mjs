import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getOpenNextVersionForNext, WORKER_WRANGLER_VERSION } from '../scripts/cloudflare-preview-versions.mjs';
import {
  MAX_CLOUDFLARE_PREVIEW_FILE_BYTES,
  MAX_CLOUDFLARE_PREVIEW_FILES,
  MAX_CLOUDFLARE_PREVIEW_TOTAL_BYTES,
  isCloudflarePagesProjectName,
  isVerifiedCloudflarePreviewUrl,
  validateStaticPreviewFiles,
} from '../lib/cloudflare-preview/static-assets.ts';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('static preview accepts bounded prebuilt HTML assets only', () => {
  const result = validateStaticPreviewFiles({
    'index.html': '<main>Ready</main>',
    'assets/app.js': 'document.body.dataset.ready = "true";',
    'assets/site.css': 'body { color: black; }',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.files['index.html'], '<main>Ready</main>');
    assert.equal(result.totalBytes, new TextEncoder().encode('<main>Ready</main>document.body.dataset.ready = "true";body { color: black; }').byteLength);
  }
});

test('static preview rejects missing entry point, source files, traversal, and hidden files', () => {
  assert.deepEqual(validateStaticPreviewFiles({ 'site.css': 'body{}' }), { ok: false, code: 'missing_index' });
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': 'ok', 'app.tsx': 'export default 1' }), { ok: false, code: 'unsupported_file' });
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': 'ok', '../secret.js': 'bad' }), { ok: false, code: 'invalid_files' });
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': 'ok', '.env': 'secret' }), { ok: false, code: 'invalid_files' });
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': 'ok', 'INDEX.HTML': 'duplicate' }), { ok: false, code: 'invalid_files' });
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': 'ok', 'assets/app.js': 'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";' }), { ok: false, code: 'sensitive_credential' });
});

test('static preview enforces existing workspace file and tighter deployment caps', () => {
  const oversized = 'x'.repeat(MAX_CLOUDFLARE_PREVIEW_FILE_BYTES + 1);
  assert.deepEqual(validateStaticPreviewFiles({ 'index.html': oversized }), { ok: false, code: 'file_too_large' });

  const files = { 'index.html': 'x' };
  for (let index = 0; index < MAX_CLOUDFLARE_PREVIEW_FILES; index++) files[`assets/${index}.js`] = '';
  assert.deepEqual(validateStaticPreviewFiles(files), { ok: false, code: 'too_many_files' });

  const overTotal = { 'index.html': 'x' };
  for (let index = 0; index < 8; index++) overTotal[`assets/${index}.css`] = 'x'.repeat(250_000);
  assert.deepEqual(validateStaticPreviewFiles(overTotal), { ok: false, code: 'file_too_large' });
});

test('Cloudflare project names and preview URLs are tightly constrained', () => {
  assert.equal(isCloudflarePagesProjectName('leo-preview'), true);
  assert.equal(isCloudflarePagesProjectName('-unsafe'), false);
  assert.equal(isCloudflarePagesProjectName('UpperCase'), false);
  assert.equal(isVerifiedCloudflarePreviewUrl('https://leo-preview-abc.leo-preview.pages.dev/', 'leo-preview-abc', 'leo-preview'), true);
  assert.equal(isVerifiedCloudflarePreviewUrl('https://attacker.example/', 'leo-preview-abc', 'leo-preview'), false);
  assert.equal(isVerifiedCloudflarePreviewUrl('https://leo-preview-abc.leo-preview.pages.dev.attacker.example/', 'leo-preview-abc', 'leo-preview'), false);
  assert.equal(isVerifiedCloudflarePreviewUrl('http://leo-preview-abc.leo-preview.pages.dev/', 'leo-preview-abc', 'leo-preview'), false);
});

test('preview API is owner- and plan-scoped and the deployment queue has hard caps', async () => {
  const route = await source('app/api/workspaces/[id]/preview/route.ts');
  const migration = await source('supabase/migrations/20261105120000_cloudflare_static_previews.sql');
  const workflow = await source('.github/workflows/cloudflare-preview-worker.yml');
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /getEffectiveUserPlan/);
  assert.match(route, /validateCloudflareWorkerPreviewFiles/);
  assert.match(route, /create_cloudflare_preview_job/);
  assert.match(route, /status: 202/);
  assert.match(migration, /where user_id = p_user_id and created_at >= now\(\) - interval '24 hours'/i);
  assert.match(migration, /preview_user_monthly_limit/);
  assert.match(migration, /status in \('building','testing','deploying','live'\)/i);
  assert.match(migration, /where created_at >= now\(\) - interval '30 days'/i);
  assert.match(migration, /create unique index if not exists cloudflare_preview_jobs_one_active_per_project/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /enable row level security/i);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_PAGES_PROJECT/);
  assert.doesNotMatch(workflow, /wrangler pages project create/);
});

test('preview worker stores no credentials in job payloads and verifies project-scoped Worker deployment', async () => {
  const worker = await source('scripts/cloudflare-preview-worker.mjs');
  const resultRoute = await source('app/api/internal/previews/result/route.ts');
  assert.equal(WORKER_WRANGLER_VERSION, '4.164.0');
  assert.match(worker, /wrangler@' \+ WORKER_WRANGLER_VERSION/);
  assert.match(worker, /wrangler\.jsonc/);
  assert.match(worker, /workers\.dev/);
  assert.match(worker, /SECRET_PATTERNS/);
  assert.match(worker, /redirect: 'manual'/);
  assert.match(worker, /api\/internal\/previews\/result/);
  assert.match(resultRoute, /isVerifiedCloudflareWorkerPreviewUrl/);
  assert.match(resultRoute, /static_files: \{\}/);
  assert.doesNotMatch(resultRoute, /CLOUDFLARE_API_TOKEN/);
});

test('preview worker uses a pinned compatible OpenNext adapter and rejects unknown Next versions', () => {
  assert.equal(getOpenNextVersionForNext('16.3.6'), '1.20.10');
  assert.equal(getOpenNextVersionForNext('15.5.9'), '1.19.11');
  assert.throws(() => getOpenNextVersionForNext('17.0.0'), /No verified OpenNext adapter mapping/);
});

test('scheduled preview worker fails visibly when credentials are missing', async () => {
  const workflow = await source('.github/workflows/cloudflare-preview-worker.yml');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /Required Cloudflare preview worker secrets are missing/);
  assert.doesNotMatch(workflow, /ready=false/);
  assert.match(workflow, /timeout-minutes: 30/);
});

test('preview queue supports bounded retries, lease recovery, and persistent heartbeats', async () => {
  const migration = await source('supabase/migrations/20261123124237_cloudflare_preview_retries_and_heartbeats.sql');
  const workerRoute = await source('app/api/internal/previews/worker/route.ts');
  const resultRoute = await source('app/api/internal/previews/result/route.ts');
  const worker = await source('scripts/cloudflare-preview-worker.mjs');
  assert.match(migration, /attempts between 0 and 3/);
  assert.match(migration, /lease_expires_at <= now\(\)/);
  assert.match(migration, /cloudflare_preview_worker_heartbeats/);
  assert.match(workerRoute, /p_lease_seconds: 1800/);
  assert.match(workerRoute, /cloudflare_preview_worker_heartbeats/);
  assert.match(workerRoute, /lease_expires_at: new Date\(Date.now\(\) \+ 30 \* 60 \* 1000\)/);
  assert.match(resultRoute, /const shouldRetry = status === 'failed' && \(job\.attempts \|\| 0\) < 3/);
  assert.match(resultRoute, /nextStatus === 'queued'/);
  assert.match(worker, /setInterval\(\(\) =>/);
  assert.match(worker, /errorMessage/);
});
