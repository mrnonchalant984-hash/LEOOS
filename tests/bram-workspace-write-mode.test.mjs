import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const chatRoute = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const workspaceBuilder = await readFile(new URL('../components/ide/WorkspaceBuilderSplit.tsx', import.meta.url), 'utf8');

test('Bram workspace builder routes project edits through authenticated build tools, not read-only tool mode', () => {
  assert.match(workspaceBuilder, /mode:'normal',work_mode:true,request_type:requestType/);
  assert.match(chatRoute, /requestedWorkMode === true && project_id/);
  assert.match(chatRoute, /requestedRequestType === 'build' \|\| requestedRequestType === 'repair'/);
  assert.match(chatRoute, /const buildMode = Boolean\(ctx && explicitBuildIntent && !customAgent\)/);
  assert.match(chatRoute, /allowBuildActions: buildMode/);
  assert.match(chatRoute, /EXISTING WORKSPACE EDIT MODE/);
  assert.match(chatRoute, /save_project_files/);
  assert.doesNotMatch(workspaceBuilder, /mode:'tools',work_mode:true/);
});
