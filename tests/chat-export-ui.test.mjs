import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const widget = readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
test('document export controls are contextual to an explicit preceding user request', () => {
  assert.match(widget, /messages\.slice\(0, i\)\.reverse\(\)\.find\(item => item\.role === "user"\)/);
  assert.match(widget, /aria-label="Requested document exports"/);
  assert.match(widget, /create\|make\|generate\|export\|download\|save\|provide\|give me/);
});
test('image-only chat turns can be sent without a non-empty text composer', () => {
  assert.match(widget, /disabled=\{\(!input\.trim\(\) && !pendingImages\.length && !pendingDocuments\.length\) \|\| loading\}/);
  assert.match(widget, /Please analyse the attached image\(s\)/);
});
