const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('LeoCode contributes explicit start and stop commands for the native AHP host', () => {
  const manifest = JSON.parse(read('package.json'));
  const commands = new Set(manifest.contributes.commands.map(item => item.command));
  assert.ok(commands.has('leocode.startAgentHost'));
  assert.ok(commands.has('leocode.stopAgentHost'));
  assert.equal(manifest.engines.vscode, '^1.106.0');
  assert.equal(manifest.dependencies['@ahpd/sdk'], '0.14.0');
  assert.equal(manifest.dependencies['@ahpd/agent-cofold'], '0.14.0');
});

test('AHP host binds loopback only, requires a random token, and keeps LeonardX auth in SecretStorage', () => {
  const source = read('src', 'ahp', 'host.ts');
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /host: '127\.0\.0\.1'/);
  assert.match(source, /apiKey: \(\) => api\.getAccessTokenForAgentHost\(\)/);
  assert.match(source, /files: \{ requireRead: true \}/);
  assert.match(source, /behavior: 'ask'/);
  assert.match(source, /behavior: 'deny'/);
  assert.match(source, /api\.request.*\/api\/leocode\/agent\/v1\/models/);
  assert.doesNotMatch(source, /process\.env\.GEMINI_API_KEY/);
});

test('AHP model proxy authenticates, enforces the LeoCode quota, and keeps the Gemini key server-side', () => {
  const source = fs.readFileSync(path.resolve(root, '..', '..', 'app/api/leocode/agent/v1/chat/completions/route.ts'), 'utf8');
  assert.match(source, /getProfile\(req\)/);
  assert.match(source, /enforceLeoCodeDailyQuota/);
  assert.match(source, /process\.env\.GEMINI_API_KEY/);
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/);
  assert.match(source, /getLeoSystemPrompt\(\)/);
  const modelsRoute = fs.readFileSync(path.resolve(root, '..', '..', 'app/api/leocode/agent/v1/models/route.ts'), 'utf8');
  assert.match(modelsRoute, /getDefaultTextModel\(\)/);
  assert.match(modelsRoute, /server-controlled/);
});
