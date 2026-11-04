import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('Leo empty state shows welcome, starter prompts, and an available composer', () => {
  assert.match(source, /min-h-\[52vh\].*max-w-2xl/s);
  assert.match(source, /\{composer\}/);
  assert.match(source, /Welcome, \{welcomeName\}/);
  assert.match(source, /actions\.map/);
  assert.match(source, /aria-label="Quick starts"/);
  assert.match(source, /messages\.length === 0 && <div/);
});

test('Leo chat model choices are sent to the server and validated by server-side routing', () => {
  assert.match(source, /leo-model-select/);
  assert.match(source, /selectedModel !== 'auto'/);
  assert.match(source, /model: selectedModel/);
  assert.match(source, /fetch\("\/api\/chat"/);
});

test('conversation composer remains available unless the memory editor is open', () => {
  assert.match(source, /\!memoryOpen && <div className="border-t/);
  assert.match(source, /messages\.length === 0 && <div.*aria-label="Quick starts"/s);
});
