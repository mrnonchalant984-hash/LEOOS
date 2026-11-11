import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  createWorkspaceZip,
  createWorkspaceZipStream,
  selectWorkspaceExportFiles,
  WorkspaceExportError,
  workspaceDownloadFilename,
} from '../lib/workspace-export.ts';

test('workspace export selects individual files and preserves selected folder structure', () => {
  const files = {
    'app/page.tsx': 'export default function Page() {}',
    'app/layout.tsx': 'export default function Layout() {}',
    'README.md': '# Project',
  };
  assert.deepEqual(Object.keys(selectWorkspaceExportFiles(files, ['README.md']).files), ['README.md']);
  assert.deepEqual(Object.keys(selectWorkspaceExportFiles(files, ['app']).files).sort(), ['app/layout.tsx', 'app/page.tsx']);
  assert.deepEqual(Object.keys(selectWorkspaceExportFiles(files).files).sort(), Object.keys(files).sort());
});

test('workspace export excludes secret files and secret-like source contents', () => {
  const result = selectWorkspaceExportFiles({
    'app/page.tsx': 'export default function Page() {}',
    '.env.local': 'GEMINI_API_KEY=not-a-real-key-value',
    '.env.example': 'GEMINI_API_KEY=',
    'src/private.ts': 'const api_key = "this-is-a-long-secret-value";',
    'certs/release.pem': 'private key',
  });
  assert.deepEqual(Object.keys(result.files), ['app/page.tsx', '.env.example']);
  assert.equal(result.omittedSensitiveFiles, 3);
});

test('workspace export refuses traversal, missing selections, and oversized projects', () => {
  assert.throws(() => selectWorkspaceExportFiles({ 'app/page.tsx': 'ok' }, ['../private']), WorkspaceExportError);
  assert.throws(() => selectWorkspaceExportFiles({ 'app/page.tsx': 'ok' }, ['missing']), error => error instanceof WorkspaceExportError && error.status === 404);
  assert.throws(() => selectWorkspaceExportFiles({ 'large.txt': 'x'.repeat(2_000_001) }), error => error instanceof WorkspaceExportError && error.status === 413);
});

test('workspace ZIP opens with a safe project root and original directory paths', async () => {
  const bytes = await createWorkspaceZip('../Unsafe Project', { 'src/index.ts': 'export const answer = 42;' });
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(await zip.file('Unsafe-Project/src/index.ts').async('string'), 'export const answer = 42;');
  assert.equal(workspaceDownloadFilename('../Unsafe Project', 'zip'), 'Unsafe-Project.zip');
});

test('workspace ZIP streaming output preserves the archive without buffering it in the route', async () => {
  const stream = createWorkspaceZipStream('Streamed Project', { 'src/main.ts': 'export const streamed = true;' });
  const bytes = await new Response(Readable.toWeb(stream)).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(await zip.file('Streamed-Project/src/main.ts').async('string'), 'export const streamed = true;');
});

test('workspace export route and IDE keep downloads authenticated, owner-scoped, and tied to saved files', async () => {
  const route = await readFile(new URL('../app/api/workspaces/[id]/export/route.ts', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../components/ide/WebIde.tsx', import.meta.url), 'utf8');
  assert.match(route, /getProfile/);
  assert.match(route, /\.eq\('id', id\)[\s\S]*?\.eq\('user_id', auth\.user\.id\)/);
  assert.match(route, /validateIdeFiles/);
  assert.match(route, /createWorkspaceZipStream/);
  assert.match(route, /Readable\.toWeb/);
  assert.match(route, /private, no-store/);
  assert.match(editor, /Download project ZIP/);
  assert.match(editor, /blockUnsavedExport/);
  assert.match(editor, /Download \$\{path\}/);
});
