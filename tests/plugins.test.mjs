import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePluginManifest, pluginLifecycleSchema } from '../lib/plugins-core.ts';

const manifest = {
  id: 'sample-adapter',
  name: 'Sample adapter',
  version: '1.2.3',
  apiVersion: '1',
  description: 'Metadata-only integration contract.',
  permissions: ['projects:read'],
  entrypoint: 'https://plugins.example.com/adapter',
};

test('plugin manifest accepts only versioned metadata with allowlisted permissions', () => {
  assert.deepEqual(parsePluginManifest(manifest), manifest);
  assert.throws(() => parsePluginManifest({ ...manifest, permissions: ['admin:all'] }));
  assert.throws(() => parsePluginManifest({ ...manifest, apiVersion: '2' }));
  assert.throws(() => parsePluginManifest({ ...manifest, version: '1.2' }));
  assert.throws(() => parsePluginManifest({ ...manifest, permissions: ['projects:read', 'projects:read'] }));
});

test('plugin entrypoints reject insecure or internal targets', () => {
  for (const entrypoint of [
    'http://plugins.example.com/adapter',
    'https://user:pass@plugins.example.com/adapter',
    'https://localhost/adapter',
    'https://plugin.internal/adapter',
    'https://127.0.0.1/adapter',
    'https://plugins.example.com:8443/adapter',
  ]) assert.throws(() => parsePluginManifest({ ...manifest, entrypoint }), entrypoint);
});

test('plugin lifecycle contract is explicit', () => {
  for (const status of ['registered', 'enabled', 'disabled', 'deprecated']) assert.equal(pluginLifecycleSchema.safeParse(status).success, true);
  assert.equal(pluginLifecycleSchema.safeParse('running').success, false);
});
