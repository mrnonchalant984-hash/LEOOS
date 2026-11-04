import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const visualizer = await readFile(new URL('../components/BuildProgressVisualizer.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/websites/[id]/page.tsx', import.meta.url), 'utf8');
const provider = await readFile(new URL('../lib/ai/provider-registry.ts', import.meta.url), 'utf8');

test('build progress uses terminal states instead of an endless busy indicator', () => {
  assert.match(visualizer, /status === "build_failed"/);
  assert.match(visualizer, /status === "deploy_failed"/);
  assert.match(visualizer, /aria-busy=\{!terminal\}/);
  assert.doesNotMatch(visualizer, /aria-busy="true"/);
  assert.match(visualizer, /The build could not be completed/);
  assert.match(page, /buildProgressVisible = buildIsActive \|\| \["build_failed", "deploy_failed", "cancelled"\]/);
});

test('Gemini provider requests have a bounded HTTP timeout', () => {
  assert.equal((provider.match(/timeout: 45_000/g) || []).length, 2);
  assert.match(provider, /timed out before completing the request/);
});
