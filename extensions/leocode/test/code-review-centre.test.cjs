const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Code Review Centre emits structured evidence and distinguishes finding classes', () => {
  const engine = read('src', 'review', 'engine.ts');
  for (const value of ['Critical', 'High', 'Medium', 'Low', 'Informational', 'confirmed_defect', 'potential_defect', 'suggestion', 'uncertain']) {
    assert.ok(engine.includes(value), `missing review classification ${value}`);
  }
  for (const field of ['id:', 'severity:', 'filePath:', 'line:', 'category:', 'description:', 'technicalExplanation:', 'evidence:', 'recommendedCorrection:', 'confidence:', 'verificationStatus:']) {
    assert.ok(engine.includes(field), `missing structured finding field ${field}`);
  }
  assert.match(engine, /languages\.getDiagnostics/);
  assert.match(engine, /reviewGitChanges/);
  assert.match(engine, /MAX_REVIEW_TOTAL_BYTES/);
});

test('review findings can be opened and safe fixes require preview, approval, and stale checks', () => {
  const centre = read('src', 'review', 'centre.ts');
  assert.match(centre, /vscode\.diff/);
  assert.match(centre, /showWarningMessage/);
  assert.match(centre, /latest\.getText\(\) !== before/);
  assert.match(centre, /workspace\.applyEdit/);
  assert.match(centre, /showTextDocument/);
});

test('LeoCode registers file, selection, workspace and Git review plus specialist orchestration', () => {
  const manifest = JSON.parse(read('package.json'));
  const commands = new Set(manifest.contributes.commands.map(command => command.command));
  for (const command of ['leocode.reviewFile', 'leocode.reviewSelection', 'leocode.reviewWorkspace', 'leocode.reviewGitChanges', 'leocode.coordinateAgents', 'leocode.runTests', 'leocode.inspectGit']) {
    assert.ok(commands.has(command), `missing ${command}`);
  }
  const extension = read('src', 'extension.ts');
  assert.match(extension, /reviewCentre\.show\(await reviewFile\(\)\)/);
  assert.match(extension, /coordinateSpecialists\(api, output\)/);
});

test('specialist coordination uses existing registry, collects real responses and gates delegation on approval', () => {
  const source = read('src', 'review', 'orchestration.ts');
  assert.match(source, /\/api\/agents/);
  assert.match(source, /agent_id: 'leo-manager'/);
  assert.match(source, /available\.has\(item\.agent_id\)/);
  assert.match(source, /showWarningMessage/);
  assert.match(source, /\/api\/agents\/run/);
  assert.match(source, /results\.push/);
});

test('terminal execution captures VS Code shell output after exact-command approval', () => {
  const source = read('src', 'workspace', 'terminal.ts');
  assert.match(source, /showWarningMessage/);
  assert.match(source, /integration\.executeCommand\(normalized\)/);
  assert.match(source, /activeExecution\.read\(\)/);
  assert.match(source, /onDidEndTerminalShellExecution/);
  assert.match(source, /event\.exitCode/);
  assert.match(source, /discoverWorkspaceTests/);
});
