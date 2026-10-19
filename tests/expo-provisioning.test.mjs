import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provisionExpoProject, withExpoProjectId } from '../lib/builders/expo-provisioning.ts';

const leonardxProjectId = '11111111-1111-4111-8111-111111111111';
const easProjectId = '22222222-2222-4222-8222-222222222222';

function files(app = { expo: { name: 'Shopping App', slug: 'shopping-app' } }) {
  return {
    'package.json': JSON.stringify({ name: 'shopping-app', dependencies: { expo: '~57.0.0' } }),
    'app.json': JSON.stringify(app),
    'eas.json': JSON.stringify({ build: { preview: { android: { buildType: 'apk' } }, production: {} } }),
  };
}

test('provisions an EAS project from the authenticated account without a caller-supplied provider ID', async () => {
  const calls = [];
  const run = async (_files, args) => {
    calls.push(args[0]);
    if (args[0] === 'whoami') return { code: 0, stdout: 'LeonardX-Mobile-Builder', stderr: '' };
    if (args[0] === 'project:init') return { code: 0, stdout: JSON.stringify({ status: 'created', projectId: easProjectId }), stderr: '' };
    return { code: 0, stdout: JSON.stringify({ id: easProjectId }), stderr: '' };
  };
  const result = await provisionExpoProject(files(), leonardxProjectId, run);
  const app = JSON.parse(result.files['app.json']).expo;
  assert.equal(result.expoProjectId, easProjectId);
  assert.equal(app.owner, 'LeonardX-Mobile-Builder');
  assert.equal(app.slug, 'leonardx-111111111111411181111111');
  assert.equal(app.android.package, 'com.leonardx.app.p1111111111114111');
  assert.deepEqual(calls, ['whoami', 'project:init', 'project:info']);
});

test('reuses only a database-mapped EAS project and does not trust an app.json UUID', async () => {
  const calls = [];
  const existingFiles = files({ expo: { name: 'Shopping App', slug: 'existing-app', extra: { eas: { projectId: easProjectId } } } });
  const run = async (_files, args) => {
    calls.push(args[0]);
    if (args[0] === 'whoami') return { code: 0, stdout: 'LeonardX-Mobile-Builder', stderr: '' };
    return { code: 0, stdout: JSON.stringify({ id: easProjectId }), stderr: '' };
  };
  const result = await provisionExpoProject(existingFiles, leonardxProjectId, run, undefined, easProjectId);
  assert.equal(result.expoProjectId, easProjectId);
  assert.deepEqual(calls, ['whoami', 'project:info']);
});

test('does not claim provisioning when Expo account creation or identity verification fails', async () => {
  await assert.rejects(
    provisionExpoProject(files(), leonardxProjectId, async (_files, args) => args[0] === 'whoami'
      ? { code: 0, stdout: 'not an account name!', stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
    /EXPO_ACCOUNT_NAME/,
  );
  await assert.rejects(
    provisionExpoProject(files(), leonardxProjectId, async (_files, args) => args[0] === 'whoami'
      ? { code: 0, stdout: 'LeonardX-Mobile-Builder', stderr: '' }
      : { code: 1, stdout: '', stderr: 'provider failure' }),
    /can create projects/,
  );
});

test('rejects a mismatched configured Expo account instead of linking under the wrong owner', async () => {
  await assert.rejects(
    provisionExpoProject(files({ expo: { name: 'Shopping App', slug: 'shopping-app', owner: 'other-account' } }), leonardxProjectId,
      async (_files, args) => ({ code: 0, stdout: args[0] === 'whoami' ? 'LeonardX-Mobile-Builder' : JSON.stringify({ projectId: easProjectId }), stderr: '' }),
      'LeonardX-Mobile-Builder'),
    /does not match the server-selected Expo account/,
  );
});

test('provider status metadata always uses the owner-scoped persisted EAS project ID', () => {
  const changed = files({ expo: { name: 'Shopping App', slug: 'edited', extra: { eas: { projectId: '33333333-3333-4333-8333-333333333333' } } } });
  const trusted = withExpoProjectId(changed, easProjectId);
  assert.equal(JSON.parse(trusted['app.json']).expo.extra.eas.projectId, easProjectId);
  assert.equal(JSON.parse(changed['app.json']).expo.extra.eas.projectId, '33333333-3333-4333-8333-333333333333');
});