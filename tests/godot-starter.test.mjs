import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBrowserGameStarter } from '../lib/builders/browser-game-starter.ts';

const setupRoute = new URL('../app/api/setup/projects/route.ts', import.meta.url);

test('legacy Godot starter test is migrated to the supported browser-game project flow', async () => {
  const route = await readFile(setupRoute, 'utf8');
  assert.match(route, /createBrowserGameStarter/);
  assert.doesNotMatch(route, /createGodotActionStarter/);
  assert.doesNotMatch(route, /createGodotFootballStarter/);
});

test('game project creation produces a runnable browser project instead of a native Godot tree', () => {
  const files = createBrowserGameStarter('Football Brief', {
    description: 'football soccer game with a bounded match loop',
  });
  assert.ok(files['index.html']);
  assert.ok(files['src/main.js']);
  assert.ok(files['README.md'].includes('No native engine'));
  assert.equal(JSON.parse(files['leonardx.game.json']).runtime, 'browser');
  assert.ok(!Object.keys(files).some((path) => path.endsWith('.gd') || path.endsWith('.tscn') || path.endsWith('.godot')));
});
