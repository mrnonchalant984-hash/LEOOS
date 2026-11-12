import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Cloudflare deployment does not upload source maps over the Worker size limit', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

  assert.equal(config.upload_source_maps, false);
});

test('Cloudflare uses the OpenNext worker build and deploy commands', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const buildScript = await readFile(new URL('../scripts/build-cloudflare.mjs', import.meta.url), 'utf8');

  assert.equal(config.main, '.open-next/worker.js');
  assert.deepEqual(config.assets, { directory: '.open-next/assets', binding: 'ASSETS' });
  assert.equal(packageJson.scripts['cloudflare:build'], 'node scripts/build-cloudflare.mjs');
  assert.equal(packageJson.scripts['cloudflare:deploy'], 'opennextjs-cloudflare deploy');
  assert.equal(packageJson.scripts['cloudflare:preview'], 'npm run cloudflare:build && opennextjs-cloudflare preview');
  assert.equal(packageJson.devDependencies['@opennextjs/cloudflare'], '1.19.11');
  assert.match(buildScript, /requestedHeapMb = 3072/);
  assert.match(buildScript, /--max-old-space-size=\$\{requestedHeapMb\}/);
  assert.match(buildScript, /\['run', 'typecheck'\]/);
  assert.match(buildScript, /\['exec', '--', 'opennextjs-cloudflare', 'build'\]/);
});

test('Cloudflare auth uses Edge Middleware and enforces MFA', async () => {
  const middleware = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');

  assert.match(middleware, /export const runtime = 'experimental-edge'/);
  assert.match(middleware, /export async function middleware\(/);
  assert.doesNotMatch(middleware, /export async function proxy\(/);
  assert.match(middleware, /@\/lib\/auth-cookies/);
  assert.match(middleware, /enforceMfa/);
});
