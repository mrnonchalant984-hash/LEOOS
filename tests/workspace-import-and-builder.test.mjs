import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/workspaces/import/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/import-project/page.tsx', import.meta.url), 'utf8');
const split = await readFile(new URL('../components/ide/WorkspaceBuilderSplit.tsx', import.meta.url), 'utf8');
const ide = await readFile(new URL('../components/ide/WebIde.tsx', import.meta.url), 'utf8');
const chat = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');

test('project import authenticates, rate limits, enforces plan and saves only to the authenticated owner', () => {
  assert.match(route, /getProfile\(request\)/);
  assert.match(route, /enforceUserRateLimit\(context\.user\.id, 'project-import'/);
  assert.match(route, /planAllows\(plan, 'web-app-builder'\)/);
  assert.match(route, /\.eq\('user_id', context\.user\.id\)/);
  assert.match(route, /db\.from\('projects'\)\.insert/);
});

test('GitHub and ZIP imports exclude credentials, private keys, binary files and generated folders', () => {
  assert.match(route, /SECRET_PATH/);
  assert.match(route, /SECRET_CONTENT/);
  assert.match(route, /SKIP_DIR/);
  assert.match(route, /BINARY_EXT/);
  assert.match(route, /openConnectionConfig/);
  assert.match(route, /connection\.status !== 'verified'/);
  assert.match(route, /AbortSignal\.timeout\(15000\)/);
});

test('import page supports public website references, connected GitHub repositories and ZIP uploads', () => {
  assert.match(page, /type Source = 'website' \| 'github' \| 'zip'/);
  assert.match(page, /fetch\('\/api\/workspaces\/import'/);
  assert.match(page, /github_connection_id/);
  assert.match(page, /form\.set\('zip',zipFile\)/);
  assert.match(page, /router\.replace\(body\.workspace_url/);
});

test('existing Web IDE includes the split-screen Bram builder and keeps the code editor accessible', () => {
  assert.match(ide, /WorkspaceBuilderSplit/);
  assert.match(ide, /initialSessionId/);
  assert.match(ide, /workspace-code-editor/);
  assert.match(ide, /onCreatePreview/);
});

test('split-screen builder sends explicit build and repair requests through authenticated chat orchestration', () => {
  assert.match(split, /request_type:requestType/);
  assert.match(split, /Authorization:'Bearer '\+auth\.session\.access_token/);
  assert.match(split, /requestType: 'build'\|'repair'/);
  assert.match(split, /onCreatePreview/);
  assert.match(chat, /request_type: requestedRequestType/);
  assert.match(chat, /requestedRequestType !== 'build'.*requestedRequestType !== 'repair'/);
  assert.match(chat, /repairRequest/);
  assert.match(chat, /leo-free-repair/);
});
