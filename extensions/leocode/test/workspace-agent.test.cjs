const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(extensionRoot, ...parts), 'utf8');

test('workspace agent support protects workspace context and confirms commands', () => {
  const context = read('src', 'workspace', 'context.ts');
  const policy = read('src', 'workspace', 'policy.ts');
  const extension = read('src', 'extension.ts');

  assert.match(context, /getActiveWorkspaceContext/);
  assert.match(policy, /isSafeWorkspacePath/);
  assert.match(extension, /showWarningMessage/);
  assert.match(extension, /runApprovedTerminalCommand/);
});

test('workspace context rejects unsafe paths and symlink traversal', () => {
  const policy = read('src', 'workspace', 'policy.ts');
  const context = read('src', 'workspace', 'context.ts');
  assert.match(policy, /segment === '\.\.'/);
  assert.match(policy, /SENSITIVE_FILE/);
  assert.match(context, /assertNoWorkspaceSymlinks/);
  assert.match(context, /SymbolicLink/);
});

test('workspace sharing is bounded, redacted, and explicitly confirmed', () => {
  const limits = read('src', 'workspace', 'limits.ts');
  const context = read('src', 'workspace', 'context.ts');
  assert.match(limits, /MAX_SELECTED_CONTEXT_FILES = 5/);
  assert.match(limits, /MAX_SELECTED_CONTEXT_BYTES = 32 \* 1024/);
  assert.match(context, /redactWorkspaceText/);
  assert.match(context, /showWarningMessage/);
  assert.match(context, /Send selected files/);
});

test('workspace scans avoid excluded directories and binary files', () => {
  const context = read('src', 'workspace', 'context.ts');
  assert.match(context, /node_modules,\.git,\.next,dist,build,coverage/);
  assert.match(context, /bytes\.includes\(0\)/);
  assert.match(context, /MAX_WORKSPACE_SEARCH_FILES/);
  assert.match(context, /MAX_WORKSPACE_SEARCH_BYTES/);
});
