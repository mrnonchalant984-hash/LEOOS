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

  assert.equal(config.main, '.open-next/worker.js');
  assert.deepEqual(config.assets, { directory: '.open-next/assets', binding: 'ASSETS' });
  assert.equal(packageJson.scripts['cloudflare:build'], 'npm run typecheck && opennextjs-cloudflare build');
  assert.equal(packageJson.scripts['cloudflare:deploy'], 'opennextjs-cloudflare deploy');
  assert.equal(packageJson.scripts['cloudflare:preview'], 'npm run cloudflare:build && opennextjs-cloudflare preview');
  assert.equal(packageJson.devDependencies['@opennextjs/cloudflare'], '1.19.11');
});

test('Cloudflare auth middleware uses the Edge middleware convention', async () => {
  const middleware = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');

  assert.match(middleware, /export async function middleware\(/);
  assert.doesNotMatch(middleware, /export async function proxy\(/);
  assert.match(middleware, /@\/lib\/auth-cookies/);
});
