import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserGameStarter } from '../lib/builders/browser-game-starter.ts';

test('browser game starter emits a runnable self-contained Canvas project with input and restart', () => {
  const files = createBrowserGameStarter('Sky Runner', { description: '2D endless runner with obstacles and score' });
  assert.ok(files['index.html'].includes('<canvas id="game"'));
  assert.ok(files['index.html'].includes('requestAnimationFrame'));
  assert.ok(files['index.html'].includes('keydown'));
  assert.ok(files['index.html'].includes('Restart'));
  assert.ok(files['src/main.js'].includes('requestAnimationFrame'));
  assert.ok(files['README.md'].includes('No native engine'));
  assert.equal(JSON.parse(files['leonardx.game.json']).runtime, 'browser');
});

test('browser game starter selects distinct 2D mechanics for platformer, racing, puzzle, and top-down prompts', () => {
  const cases = [
    ['Jumping platformer', 'platformer'],
    ['2D car racing game', 'racing'],
    ['Sliding puzzle game', 'puzzle'],
    ['Top-down survival maze', 'top-down'],
  ];
  for (const [brief, kind] of cases) {
    const files = createBrowserGameStarter('Test Game', { description: brief });
    assert.equal(JSON.parse(files['leonardx.game.json']).kind, kind);
    assert.ok(files['index.html'].length > 1000);
  }
});

test('3D racing brief gets a Three.js WebGL scene with traffic, speedometer, collision, touch and restart', () => {
  const files = createBrowserGameStarter('Metro Sprint', { description: '3D racing game with three cars, city track, collision physics, speedometer, mobile-friendly controls' });
  assert.ok(files['index.html'].includes('three.module.js'));
  assert.ok(files['index.html'].includes('Speed:'));
  assert.ok(files['index.html'].includes('Collision!'));
  assert.ok(files['index.html'].includes('pointerdown'));
  assert.ok(files['index.html'].includes('Restart'));
  assert.equal(JSON.parse(files['leonardx.game.json']).kind, '3d-racing');
  assert.ok(files['src/three-scene.js'].includes('THREE'));
});

test('starter files contain no secrets or native engine compilation manifests', () => {
  const files = createBrowserGameStarter('Puzzle Box', { description: 'Puzzle game' });
  assert.ok(!Object.keys(files).some(path => /\.godot$|\.apk$|\.aab$|Dockerfile\.android/i.test(path)));
  assert.ok(!Object.values(files).some(content => /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9]{20,}/.test(content)));
});
