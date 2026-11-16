import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const route = fs.readFileSync(new URL('../app/api/workspaces/[id]/runtime/route.ts', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../components/LEOWidget.tsx', import.meta.url), 'utf8');
const docs = fs.readFileSync(new URL('../docs/architecture/CLOUDFLARE_WORKSPACE_RUNTIME.md', import.meta.url), 'utf8');
test('workspace runtime is authenticated, owner-derived, rate-limited and allowlisted', () => {
  assert.match(route, /getProfile\(req\)/); assert.match(route, /getWorkspaceManifest\(auth\.user\.id/);
  assert.match(route, /enforceUserRateLimit/); assert.match(route, /const allowed = new Set\(/);
  assert.match(route, /queueGitHubRuntimeJob/); assert.doesNotMatch(route, /body\.user_id|body\.tenant_id/);
});
test('Work UI exposes fixed operations and documents finite GitHub-hosted jobs', () => {
  for (const op of ['inspect', 'install', 'test', 'typecheck', 'lint', 'build', 'git_status', 'git_diff']) assert.ok(ui.includes(`"${op}"`));
  assert.match(docs, /GitHub Actions/); assert.match(docs, /not a long-running dev server/i);
});
