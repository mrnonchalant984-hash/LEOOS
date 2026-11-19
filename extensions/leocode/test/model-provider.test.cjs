const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Bram Code uses Braverton Developer API billing and not Copilot inference', () => {
  const provider = fs.readFileSync(path.join(root, 'src', 'model-provider.ts'), 'utf8');
  const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const inline = fs.readFileSync(path.join(root, 'src', 'inline-completion.ts'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(provider, /\/api\/v1\/models/);
  assert.match(provider, /\/api\/v1\/messages/);
  assert.match(provider, /leocode\.developer-api-key/);
  assert.match(provider, /LanguageModelTextPart/);
  assert.match(provider, /toolCalling: false/);
  assert.match(inline, /\/api\/v1\/messages/);
  assert.match(inline, /inlineCompletions.enabled/);
  assert.match(inline, /SECRET_FILE/);
  assert.match(extension, /registerInlineCompletionItemProvider/);
  assert.match(extension, /leocode.toggleInlineCompletions/);
  assert.match(extension, /registerLanguageModelChatProvider\('braverton-bram-code'/);
  assert.match(extension, /leocode\.configureModel/);
  assert.equal(manifest.contributes.languageModelChatProviders[0].vendor, 'braverton-bram-code');
});
