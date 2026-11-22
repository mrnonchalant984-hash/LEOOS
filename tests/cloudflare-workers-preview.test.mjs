import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  getCloudflarePreviewWorkerName,
  isVerifiedCloudflareWorkerPreviewUrl,
  validateCloudflareWorkerPreviewFiles,
} from '../lib/cloudflare-preview/static-assets.ts';

const workerScript = await readFile(new URL('../scripts/cloudflare-preview-worker.mjs', import.meta.url), 'utf8');
const workerRoute = await readFile(new URL('../app/api/internal/previews/worker/route.ts', import.meta.url), 'utf8');
const resultRoute = await readFile(new URL('../app/api/internal/previews/result/route.ts', import.meta.url), 'utf8');
const previewRoute = await readFile(new URL('../app/api/workspaces/[id]/preview/route.ts', import.meta.url), 'utf8');

test('Cloudflare Worker preview validator accepts static bundles and full Next.js source trees', () => {
  const staticResult = validateCloudflareWorkerPreviewFiles({
    'index.html': '<!doctype html><html><body>Preview</body></html>',
    'assets/site.css': 'body { font-family: sans-serif; }',
  });
  assert.equal(staticResult.ok, true);
  if (staticResult.ok) assert.equal(staticResult.framework, 'static');

  const nextResult = validateCloudflareWorkerPreviewFiles({
    'package.json': JSON.stringify({ dependencies: { next: '14.1.0', react: '18.2.0', 'react-dom': '18.2.0' } }),
    'app/layout.tsx': 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }',
    'app/page.tsx': 'export default function Page() { return <main>Preview</main>; }',
    'tsconfig.json': '{}',
  });
  assert.equal(nextResult.ok, true);
  if (nextResult.ok) assert.equal(nextResult.framework, 'nextjs');
});

test('Cloudflare Worker preview validator rejects traversal, hidden files, secrets, and unsupported frameworks', () => {
  assert.equal(validateCloudflareWorkerPreviewFiles({ '../index.html': 'x' }).ok, false);
  assert.equal(validateCloudflareWorkerPreviewFiles({ '.env.local': 'x', 'index.html': 'x' }).ok, false);
  assert.equal(validateCloudflareWorkerPreviewFiles({ 'index.html': 'GEMINI_API_KEY=AIza' + 'A'.repeat(40) }).ok, false);
  assert.equal(validateCloudflareWorkerPreviewFiles({ 'package.json': '{}', 'src/main.rs': 'fn main() {}' }).ok, false);
});

test('Cloudflare Worker preview URLs are deterministic and restricted to the assigned worker', () => {
  const name = getCloudflarePreviewWorkerName('LeonardX', '7146ac84-aceb-4224-9ad9-0dfbb978ba74');
  assert.equal(name, 'leonardx-7146ac84aceb4224');
  assert.equal(isVerifiedCloudflareWorkerPreviewUrl('https://' + name + '.leonardudoh5.workers.dev/', name), true);
  assert.equal(isVerifiedCloudflareWorkerPreviewUrl('https://other.leonardudoh5.workers.dev/', name), false);
  assert.equal(isVerifiedCloudflareWorkerPreviewUrl('https://' + name + '.leonardx.pages.dev/', name), false);
});

test('Cloudflare preview runner is valid JavaScript and the API passes/verifies project-scoped Worker identity', () => {
  execFileSync(process.execPath, ['--check', 'scripts/cloudflare-preview-worker.mjs'], { stdio: 'pipe' });
  assert.match(workerRoute, /projectId:\s*job\.project_id/);
  assert.match(resultRoute, /getCloudflarePreviewWorkerName/);
  assert.match(resultRoute, /isVerifiedCloudflareWorkerPreviewUrl/);
  assert.match(previewRoute, /validateCloudflareWorkerPreviewFiles/);
  assert.match(workerScript, /opennextjs-cloudflare/);
  assert.match(workerScript, /workers\.dev/);
});
