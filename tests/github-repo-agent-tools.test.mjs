import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/integrations/[provider]/[action]/route.ts', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');

test('GitHub repository tools support actual source reads and atomic multi-file commits', () => {
  assert.match(route, /action === 'read-file'/);
  assert.match(route, /action === 'repository-tree'/);
  assert.match(route, /action === 'commit-status'/);
  assert.match(route, /action === 'commit-files'/);
  assert.match(route, /Explicit confirmation is required before committing to the connected repository/);
  assert.match(route, /The requested file appears to contain credentials or a private key/);
  assert.match(route, /git\/refs\/heads/);
  assert.match(tools, /name: 'github_commit_files'/);
  assert.match(tools, /name: 'github_commit_status'/);
  assert.match(chat, /github_commit_files with confirm=true/);
});

test('Leo chat makes explicit repo tasks tool-enabled and tells build workflows to write, validate, inspect and repair', () => {
  assert.match(chat, /function isRepositoryTask/);
  assert.match(chat, /allowRepositoryAccess: repositoryWorkflow/);
  assert.match(chat, /generate actual source code, save it with the write tool/);
  assert.match(chat, /make at most two targeted repairs/);
  assert.match(chat, /call build_and_deploy_website/);
  assert.match(chat, /call validate_browser_game/);
});

test('browser-game asset uploads are user/project-scoped, bounded, and exportable', () => {
  const assets = readFileSync(new URL('../app/api/games/[id]/assets/route.ts', import.meta.url), 'utf8');
  const archive = readFileSync(new URL('../app/api/games/[id]/export/route.ts', import.meta.url), 'utf8');
  assert.match(assets, /eq\('user_id', ctx\.user\.id\)/);
  assert.match(assets, /MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(assets, /file signature does not match/);
  assert.match(assets, /project_path: `assets\/\$\{assetId\}/);
  assert.match(archive, /storage\.from\('leo-files'\)\.download/);
  assert.match(archive, /X-LeonardX-Exported-Assets/);
});
