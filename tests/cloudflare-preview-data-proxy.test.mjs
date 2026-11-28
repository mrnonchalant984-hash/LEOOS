import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('preview archive snapshot includes bounded binary image and font assets', async () => {
  const [source, validator, worker, route] = await Promise.all([
    read('lib/workspace-source.ts'),
    read('lib/cloudflare-preview/static-assets.ts'),
    read('scripts/cloudflare-preview-worker.mjs'),
    read('app/api/workspaces/[id]/preview/route.ts'),
  ]);
  assert.match(source, /getCloudflarePreviewWorkspaceFiles/);
  assert.match(source, /bytes\.toString\('base64'\)/);
  assert.match(source, /binaryExtensions/);
  assert.match(validator, /WORKER_BINARY_EXTENSIONS/);
  assert.match(validator, /validBinarySignature/);
  assert.match(validator, /MAX_CLOUDFLARE_WORKER_PREVIEW_BINARY_FILE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(worker, /MAX_BINARY_FILE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(worker, /Buffer\.from\(content\.data, 'base64'\)/);
  assert.match(route, /getCloudflarePreviewWorkspaceFiles/);
});

test('preview data bridge is project-bound, short-lived, read-only and allowlisted', async () => {
  const [token, data, component, prompt] = await Promise.all([
    read('app/api/workspaces/[id]/preview/data-token/route.ts'),
    read('app/api/workspaces/[id]/preview/data/route.ts'),
    read('components/BramWorkspacePreview.tsx'),
    read('lib/agents/website-builder.ts'),
  ]);
  assert.match(token, /exp: now \+ 300/);
  assert.match(token, /scope: \['project_summary:read'\]/);
  assert.match(token, /\.eq\('user_id', context\.user\.id\)/);
  assert.match(data, /timingSafeEqual/);
  assert.match(data, /claims\.projectId !== id/);
  assert.match(data, /resource !== 'project_summary'/);
  assert.match(data, /\.eq\('user_id', claims\.sub\)/);
  assert.match(data, /enforceUserRateLimit/);
  assert.match(data, /enforceDimensionRateLimit/);
  assert.match(data, /Access-Control-Allow-Methods': 'GET, OPTIONS'/);
  assert.doesNotMatch(data, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  assert.match(component, /braverton:preview-data-capability/);
  assert.match(component, /postMessage/);
  assert.match(prompt, /Keep its token only/);
  assert.match(prompt, /Never put/);
  assert.match(prompt, /Never copy production environment variables or private credentials into preview workers/);
  assert.match(prompt, /arbitrary SQL/);
});

test('preview runner does not pass production credentials to generated build scripts', async () => {
  const worker = await read('scripts/cloudflare-preview-worker.mjs');
  const start = worker.indexOf('function buildEnvironment()');
  const end = worker.indexOf('\nfunction deployEnvironment', start);
  const buildEnvironment = worker.slice(start, end);
  assert.match(buildEnvironment, /const env = \{\}/);
  assert.match(buildEnvironment, /PATH/);
  assert.doesNotMatch(buildEnvironment, /SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|CRON_SECRET|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN/);
});
