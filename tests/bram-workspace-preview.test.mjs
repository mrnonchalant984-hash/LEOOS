import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Bram Work mode keeps the chat and sandboxed project preview in one responsive workspace', async () => {
  const widget = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
  const preview = await readFile(new URL('../components/BramWorkspacePreview.tsx', import.meta.url), 'utf8');

  assert.match(widget, /BramWorkspacePreview projectId=\{workProject\.id\}/);
  assert.match(widget, /lg:flex-row/);
  assert.match(preview, /sandbox="allow-scripts allow-forms"/);
  assert.doesNotMatch(preview, /allow-same-origin/);
  assert.match(preview, /dynamic Next\.js\/server runtime is not yet enabled/);
  assert.match(preview, /Create static preview/);
});

test('Bram project collections are keyed by project ID instead of clearing state in an effect', async () => {
  const widget = await readFile(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');

  assert.match(widget, /projectResources, setProjectResources\] = useState<\{ projectId: string;/);
  assert.match(widget, /projectChecklist, setProjectChecklist\] = useState<\{ projectId: string;/);
  assert.doesNotMatch(widget, /setProjectResources\(\[\]\)/);
  assert.doesNotMatch(widget, /setProjectChecklist\(null\)/);
  assert.match(widget, /activeProjectResources = projectResources\?\.projectId === workProject\?\.id/);
});
