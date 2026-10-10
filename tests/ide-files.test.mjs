import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdePath, validateIdeFiles } from '../lib/ide-files.ts';

test('workspace file paths reject traversal, absolute paths, and internal metadata', () => {
  assert.equal(normalizeIdePath('src/app.ts'), 'src/app.ts');
  assert.equal(normalizeIdePath('../.env'), null);
  assert.equal(normalizeIdePath('C:\\secrets\\key'), null);
  assert.equal(normalizeIdePath('.leo/scratchpad.json'), null);
  assert.equal(validateIdeFiles({ 'src/app.ts': 'export {};' }), true);
  assert.equal(validateIdeFiles({ '../.env': 'secret' }), false);
});

test('workspace files have per-file, count, and total-size bounds', () => {
  assert.equal(validateIdeFiles({ 'src/large.txt': 'x'.repeat(256_001) }), false);
  assert.equal(validateIdeFiles(Object.fromEntries(Array.from({ length: 251 }, (_, index) => [`${index}.txt`, 'x']))), false);
  assert.equal(validateIdeFiles({ 'a.txt': 'x'.repeat(1_100_000), 'b.txt': 'x'.repeat(1_000_001) }), false);
});
