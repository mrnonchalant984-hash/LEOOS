import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('LeoCode publishing uses the verified publisher ID and trusted production OIDC environment', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish-leocode.yml', import.meta.url), 'utf8');
  assert.match(workflow, /LEOCODE_PUBLISHER_ID: \$\{\{ vars\.LEOCODE_PUBLISHER_ID \|\| 'leonardx' \}\}/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npx --yes @vscode\/vsce publish --oidc/);
});
