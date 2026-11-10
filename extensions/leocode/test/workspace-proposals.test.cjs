const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parseFileProposals, isProposalStale } = require('../out/views/proposals.js');
const { isSafeWorkspacePath, normalizeWorkspacePath, redactWorkspaceText } = require('../out/workspace/policy.js');
const { getConfiguredTextModels, modelDisplayName } = require('../out/views/chat-state.js');
const {
  MAX_SELECTED_CONTEXT_BYTES,
  MAX_SELECTED_CONTEXT_FILES,
  MAX_WORKSPACE_FILE_BYTES,
  MAX_WORKSPACE_SEARCH_BYTES,
  MAX_WORKSPACE_SEARCH_FILES,
} = require('../out/workspace/limits.js');

const extensionRoot = path.resolve(__dirname, '..');

test('workspace policy excludes credentials, secret directories, dependencies, and traversal paths', () => {
  for (const file of ['.env', '.env.local', 'id_rsa', 'certs/app.pem', '.aws/credentials', 'src/.ssh/key', 'node_modules/pkg/index.js']) {
    assert.equal(isSafeWorkspacePath(file), false, file);
  }
  assert.equal(normalizeWorkspacePath('../outside.ts'), undefined);
  assert.equal(normalizeWorkspacePath('src\\app.ts'), 'src/app.ts');
  assert.equal(isSafeWorkspacePath('src/app.ts'), true);
  assert.match(redactWorkspaceText('api_key="test-secret"'), /\[redacted\]/);
});

test('workspace scans and selected file context have explicit aggregate and per-file bounds', () => {
  assert.equal(MAX_WORKSPACE_SEARCH_FILES, 250);
  assert.equal(MAX_WORKSPACE_FILE_BYTES, 256 * 1024);
  assert.equal(MAX_WORKSPACE_SEARCH_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_SELECTED_CONTEXT_FILES, 5);
  assert.equal(MAX_SELECTED_CONTEXT_BYTES, 32 * 1024);
});

test('only configured text models supported by the Gemini backend are selectable', () => {
  const models = getConfiguredTextModels([
    { id: 'google/gemini-2.5-pro', name: 'Leo Pro', model: 'gemini-2.5-pro', provider: 'google', configured: true, capabilities: ['text'] },
    { id: 'openai/gpt', name: 'GPT', model: 'gpt', provider: 'openai', configured: true, capabilities: ['text'] },
    { id: 'google/unconfigured', name: 'Missing', model: 'missing', provider: 'google', configured: false, capabilities: ['text'] },
    { id: 'google/image', name: 'Image', model: 'image', provider: 'google', configured: true, capabilities: ['image'] },
  ]);
  assert.deepEqual(models.map(model => model.id), ['google/gemini-2.5-pro']);
  assert.equal(modelDisplayName(models[0]), 'Gemini · gemini-2.5-pro (Leo Pro)');
});

test('workspace proposals support bounded multi-file diffs and reject duplicates or oversized sets', () => {
  const response = [
    '### File: src/a.ts',
    '```ts',
    'export const a = 1;',
    '```',
    '### File: src/b.ts',
    '```ts',
    'export const b = 2;',
    '```',
  ].join('\n');
  assert.deepEqual(parseFileProposals(response).map(proposal => proposal.path), ['src/a.ts', 'src/b.ts']);
  assert.throws(() => parseFileProposals(`${response}\n### File: src/a.ts\n\`\`\`\nx\n\`\`\``), /more than one proposal/);
  const tooMany = Array.from({ length: 6 }, (_, index) => `### File: src/${index}.ts\n\`\`\`ts\nx${index}\n\`\`\``).join('\n');
  assert.throws(() => parseFileProposals(tooMany), /more than five/);
});

test('proposal snapshots reject changed, replaced, and unexpectedly created files', () => {
  assert.equal(isProposalStale({
    expectedToExist: true, exists: true, expectedVersion: 1, actualVersion: 1,
    expectedContents: 'old', actualContents: 'old',
  }), false);
  assert.equal(isProposalStale({
    expectedToExist: true, exists: true, expectedVersion: 1, actualVersion: 2,
    expectedContents: 'old', actualContents: 'old',
  }), true);
  assert.equal(isProposalStale({
    expectedToExist: false, exists: true, expectedContents: '', actualContents: 'user file',
  }), true);
  assert.equal(isProposalStale({
    expectedToExist: true, exists: false, expectedContents: 'old',
  }), true);
});

test('the LeoCode chat view is registered as a retained activity-bar webview', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.publisher, 'leonardx');
  assert.equal(`${manifest.publisher}.${manifest.name}`, 'leonardx.leocode');
  assert.deepEqual(manifest.contributes.views.leocode.find(view => view.id === 'leocode.chat'), {
    id: 'leocode.chat',
    name: 'Leo Chat',
    type: 'webview',
  });
  const extension = fs.readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(extension, /registerWebviewViewProvider\('leocode\.chat'/);
  assert.match(extension, /await chatView\?\.refresh\(\)/);
});

test('sign-in refreshes chat state and expired requests do not disguise network failures as disconnection', () => {
  const extension = fs.readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8');
  const chat = fs.readFileSync(path.join(extensionRoot, 'src', 'views', 'chat-view.ts'), 'utf8');
  const api = fs.readFileSync(path.join(extensionRoot, 'src', 'api', 'client.ts'), 'utf8');
  assert.match(extension, /await api\.signIn[\s\S]*await chatView\?\.refresh\(\)/);
  assert.match(chat, /result\.reason instanceof LeonardXSessionError/);
  assert.match(chat, /state: 'unknown'/);
  assert.match(chat, /Could not verify the LeonardX connection/);
  assert.match(api, /sessionGeneration/);
  assert.match(api, /Your LeonardX session changed while refreshing/);
});

test('workspace content is opt-in and terminal commands require confirmation', () => {
  const chat = fs.readFileSync(path.join(extensionRoot, 'src', 'views', 'chat-view.ts'), 'utf8');
  const extension = fs.readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(chat, /getActiveWorkspaceContext\(includeActiveContext\)/);
  assert.match(chat, /includeActiveContext:document\.getElementById\('activeContext'\)\.checked/);
  assert.match(extension, /showWarningMessage\([\s\S]*Run command[\s\S]*terminal\.sendText\(command\.trim\(\), true\)/);
  assert.match(extension, /registerLeonardXMcpTools\(context, api\)/);
});

test('proposed edits require a confirmation and a second stale-file check before apply', () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'src', 'views', 'chat-view.ts'), 'utf8');
  assert.match(source, /showWarningMessage\([\s\S]*Apply \$\{proposalSet\.length\}/);
  assert.match(source, /for \(const proposal of proposalSet\) \{\s*documents\.set\(proposal\.uri\.toString\(\), await ensureFresh\(proposal\)\)/);
  assert.match(source, /workspace\.applyEdit\(edit\)/);
});
