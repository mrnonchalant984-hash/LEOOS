import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('game setup uses a browser-native starter instead of the retired Godot generator', async () => {
  const setup = await source('app/api/setup/projects/route.ts');
  const starter = await source('lib/builders/browser-game-starter.ts');
  assert.match(setup, /createBrowserGameStarter/);
  assert.doesNotMatch(setup, /createGodot|api\/builds\/godot/);
  assert.match(starter, /index\.html/);
  assert.match(starter, /requestAnimationFrame/);
  assert.match(starter, /Content-Security-Policy/);
  assert.match(starter, /runtime:'browser'/);
});

test('game setup does not select native engine starters for action-game briefs', async () => {
  const setup = await source('app/api/setup/projects/route.ts');
  const starter = await source('lib/builders/browser-game-starter.ts');
  assert.match(setup, /createBrowserGameStarter/);
  assert.doesNotMatch(setup, /createGodotActionStarter|createGodotFootballStarter/);
  assert.match(starter, /chooseKind/);
  assert.match(starter, /top-down/);
  assert.match(starter, /brief/);
});
