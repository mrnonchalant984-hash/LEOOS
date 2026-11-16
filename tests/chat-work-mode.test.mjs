import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');

test('Chat and Work are local modes in the same Leo workspace', () => {
  assert.match(ui, /setWorkspaceMode\("work"\)/);
  assert.match(ui, /setWorkspaceMode\("chat"\)/);
  assert.match(ui, /href="\/engineering"[^>]*>.*Engineering workflow/s);
});

test('Work mode is passed to and validated by the chat API', () => {
  assert.match(ui, /work_mode: workspaceMode === "work"/);
  assert.match(api, /work_mode: requestedWorkMode/);
  assert.match(api, /typeof requestedWorkMode !== "boolean"/);
  assert.match(api, /WORK MODE: Stay in this same Leo conversation/);
});

test('Work mode keeps normal chat attachments and avoids streaming path', () => {
  assert.match(ui, /workspaceMode !== "work" && effectiveMode === "normal"/);
  assert.match(ui, /document_asset_ids: attachedDocuments\.map/);
  assert.match(ui, /image_asset_ids: attachedImages\.map/);
});
