import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/mcp/route.ts', import.meta.url), 'utf8');

test('MCP agent failures persist sanitized provider diagnostics instead of a generic catch-all', () => {
  assert.match(route, /catch \(error\) \{[\s\S]{0,500}error instanceof ModelProviderError/);
  assert.match(route, /event: 'mcp\.agent\.execution_failed'/);
  assert.match(route, /error_type: error instanceof Error \? error\.name : 'UnknownError'/);
  assert.match(route, /provider_status: error instanceof ModelProviderError \? error\.statusCode : undefined/);
  assert.match(route, /status: 'failed', error: safeError/);
  assert.doesNotMatch(route, /console\.error\([^\n]*error\.message/);
});

test('SEO agent is routed to the read-only live audit instead of a generic text-only prompt', () => {
  const manager = fs.readFileSync(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  const registry = fs.readFileSync(new URL('../lib/agents/registry.ts', import.meta.url), 'utf8');
  assert.match(manager, /agent\.id==='seo'\) return JSON\.stringify\(await runSeoAudit\(task\)\)/);
  assert.match(registry, /\['seo',[^\n]+\['public_site_audit'\],\['read'\],false\]/);
});
