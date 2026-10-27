import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneratedGameFiles, gameFileValidationErrors } from '../lib/builders/game-generation.ts';

test('parses generated browser game files and preserves real HTML source', () => {
  const files = parseGeneratedGameFiles(JSON.stringify({ files: [
    { path: 'index.html', content: '<!doctype html><html><head></head><body><canvas id="game"></canvas><script src="src/main.js"></script></body></html>' },
    { path: 'src/main.js', content: 'document.querySelector("canvas");' },
  ], summary: 'A real canvas game.' }));
  assert.match(files['index.html'], /canvas/);
  assert.equal(files['src/main.js'], 'document.querySelector("canvas");');
  assert.deepEqual(gameFileValidationErrors(files), []);
});

test('rejects malformed model output and unsafe paths without saving', () => {
  assert.throws(() => parseGeneratedGameFiles('not json'), /invalid project-file response/);
  assert.throws(() => parseGeneratedGameFiles(JSON.stringify({ files: [{ path: '../.env', content: 'SECRET' }, { path: 'index.html', content: '<html><body><script></script></body></html>' }] })), /unsafe, oversized, or invalid file paths/);
});

test('reports missing game entry points and unsafe script URLs', () => {
  assert.ok(gameFileValidationErrors({ 'src/main.js': 'alert(1)' }).some(error => /index.html/.test(error)));
  assert.ok(gameFileValidationErrors({ 'index.html': '<html><body><script src="javascript:alert(1)"></script></body></html>' }).some(error => /unsafe script URL/.test(error)));
});
