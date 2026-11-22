import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const widget = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
const preview = await readFile(new URL('../components/BramWorkspacePreview.tsx', import.meta.url), 'utf8');

test('successful Bram file writes refresh the workspace manifest and signal preview creation', () => {
  assert.match(widget, /tool_name === 'save_project_files'/);
  assert.match(widget, /event\.event_type === 'completed'/);
  assert.match(widget, /event\.status === 'succeeded'/);
  assert.match(widget, /bram:workspace-saved/);
  assert.match(widget, /\/api\/workspaces\/\$\{encodeURIComponent\(workProject\.id\)\}\/source/);
});

test('workspace preview listens for successful saves and avoids duplicate jobs', () => {
  assert.match(preview, /bram:workspace-saved/);
  assert.match(preview, /autoCreateAfter/);
  assert.match(preview, /previewAt >= savedAt/);
  assert.match(preview, /createPreview/);
});
