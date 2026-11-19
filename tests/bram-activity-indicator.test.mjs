import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

test('Bram uses three horizontally aligned animated thinking dots', () => {
  assert.match(source, /inline-flex h-3 items-center gap-\[3px\]/);
  assert.match(source, /@keyframes bram-thinking-dot/);
  assert.equal((source.match(/animation-delay:(?:0|140|280)ms/g) || []).length, 3);
  assert.match(source, /bram-thinking-dot_1s_ease-in-out_infinite/);
});

test('Bram shows contextual activity labels instead of a fixed working label', () => {
  assert.match(source, /const \[activityLabel, setActivityLabel\] = useState\("Thinking"\)/);
  assert.match(source, /if \(latest\.event_type === "started"\)/);
  assert.match(source, /latest\.event_type === "completed"/);
  assert.match(source, /latest\.event_type === "failed"/);
  assert.match(source, /Connecting GitHub/);
  assert.match(source, /Web searched/);
  assert.match(source, /Creating project/);
  assert.match(source, /setActivityLabel\("Thinking"\)/);
  assert.match(source, /<span>\{activityLabel\}<\/span>/);
  assert.doesNotMatch(source, /Bram is working/);
  assert.doesNotMatch(source, /Bram is thinking…/);
});
