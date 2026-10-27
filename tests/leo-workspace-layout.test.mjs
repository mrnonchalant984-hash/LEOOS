import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('Leo empty state centers the composer and does not render welcome or shortcut cards', () => {
  assert.match(source, /min-h-\[62vh\].*max-w-4xl/s);
  assert.match(source, /\{composer\}/);
  assert.doesNotMatch(source, /Welcome, \{welcomeName\}/);
  assert.doesNotMatch(source, /Let’s brainstorm|Let’s create|Let’s deploy|Let’s fix|Let’s code/);
  assert.doesNotMatch(source, /aria-label="Quick starts"/);
});

test('Leo chat UI delegates model selection to server-side routing', () => {
  assert.doesNotMatch(source, /leo-model-select|selectedModel|setSelectedModel/);
  assert.doesNotMatch(source, /\/api\/models/);
  assert.match(source, /fetch\("\/api\/chat"/);
});

test('conversation composer docks at the bottom only after a conversation begins', () => {
  assert.match(source, /!memoryOpen && messages\.length > 0 && <div className="border-t/);
});
