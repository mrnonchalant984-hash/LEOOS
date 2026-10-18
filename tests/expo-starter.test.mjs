import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExpoMobileStarter } from '../lib/builders/expo-starter.ts';

test('new mobile workspaces contain a pinned Expo app and leave account-specific identifiers unset', () => {
  const files = createExpoMobileStarter('Budget {Buddy}', { purpose: 'Track spending' });
  const packageJson = JSON.parse(files['package.json']);
  const app = JSON.parse(files['app.json']);
  const eas = JSON.parse(files['eas.json']);
  assert.equal(packageJson.dependencies.expo, '~57.0.0');
  assert.equal(packageJson.dependencies.react, '19.2.3');
  assert.equal(packageJson.dependencies['react-native'], '0.86.0');
  assert.equal(app.expo.name, 'Budget {Buddy}');
  assert.equal(app.expo.extra?.eas?.projectId, undefined);
  assert.equal(app.expo.ios?.bundleIdentifier, undefined);
  assert.equal(app.expo.android?.package, undefined);
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.ok(files['App.tsx'].includes('<Text style={styles.title}>{"Budget {Buddy}"}</Text>'));
  assert.match(files['README.md'], /adding its existing UUID/);
});
