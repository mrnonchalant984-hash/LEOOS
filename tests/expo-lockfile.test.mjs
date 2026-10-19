import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureExpoLockfile } from '../lib/builders/expo-lockfile.ts';

const manifest = { name: 'shopping-app', dependencies: { expo: '~57.0.0', react: '19.2.3' } };
const files = { 'package.json': JSON.stringify(manifest), 'app.json': '{}', 'eas.json': '{}' };
const lock = JSON.stringify({ name: 'shopping-app', lockfileVersion: 3, packages: { '': { name: 'shopping-app' } } });

test('generates a matching npm lockfile for workspaces without a dependency lock', async () => {
  let calls = 0;
  const result = await ensureExpoLockfile(files, async packageJson => {
    calls++;
    assert.equal(packageJson.name, manifest.name);
    return lock;
  });
  assert.equal(result.generated, true);
  assert.equal(result.files['package-lock.json'], lock);
  assert.equal(calls, 1);
});

test('preserves existing supported lockfiles without resolving dependencies again', async () => {
  const existing = { ...files, 'yarn.lock': '# existing lock' };
  const result = await ensureExpoLockfile(existing, async () => { throw new Error('must not regenerate'); });
  assert.equal(result.generated, false);
  assert.equal(result.files['yarn.lock'], '# existing lock');
});

test('rejects inconsistent npm locks and non-npm projects without their own lockfile', async () => {
  await assert.rejects(ensureExpoLockfile(files, async () => JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'other-app' } } })), /does not match/);
  await assert.rejects(ensureExpoLockfile({ ...files, 'package.json': JSON.stringify({ ...manifest, packageManager: 'pnpm@10.0.0' }) }, async () => lock), /non-npm package manager/);
});

test('runs available project checks after EAS dependency installation', async () => {
  const packageJson = { ...manifest, scripts: { lint: 'eslint .', test: 'vitest run', typecheck: 'tsc --noEmit', 'eas-build-post-install': 'node setup.js' } };
  const result = await ensureExpoLockfile({ ...files, 'package.json': JSON.stringify(packageJson) }, async () => lock);
  const scripts = JSON.parse(result.files['package.json']).scripts;
  assert.equal(scripts['eas-build-post-install'], 'node setup.js && npm run lint && npm run test && npm run typecheck');
});