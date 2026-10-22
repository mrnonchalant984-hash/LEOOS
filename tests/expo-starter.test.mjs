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
  assert.ok(files['App.tsx'].includes('const APP_NAME = "Budget {Buddy}";'));
  assert.match(files['App.tsx'], /DESIGNED AROUND YOUR BRIEF/);
  assert.match(files['App.tsx'], /SCREENS/);
  assert.doesNotMatch(files['App.tsx'], /Starter action/);
  assert.match(files['README.md'], /requirements-driven React Native starter/);
  assert.match(files['README.md'], /adding its existing UUID/);
});

test('mobile brief controls navigation, design direction, and opt-in draft platform identifiers', () => {
  const files = createExpoMobileStarter('Field Service', {
    'What are the core user journeys and required screens?': 'Jobs, Map, Reports',
    'What visual style, colors, typography, spacing and reference apps should guide the UI?': 'Warm minimal navy and teal',
    'If you already have them, provide the Android package name and iOS bundle identifier. Otherwise write generate draft identifiers.': 'generate draft identifiers',
  });
  const app = JSON.parse(files['app.json']);
  assert.equal(app.expo.android.package, 'com.leonardx.fieldservice');
  assert.equal(app.expo.ios.bundleIdentifier, 'com.leonardx.fieldservice');
  assert.match(files['App.tsx'], /Jobs/);
  assert.match(files['App.tsx'], /Warm minimal navy and teal/);
});
