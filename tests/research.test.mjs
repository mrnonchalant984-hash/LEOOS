import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/research/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261111110000_research_reports.sql', import.meta.url), 'utf8');

test('standalone research uses authenticated Gemini grounding and bounded public URLs', () => {
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /generateText\([\s\S]*webSearch:\s*true/);
  assert.match(route, /fetchPublicHtml/);
  assert.match(route, /slice\(0, 5\)/);
  assert.match(route, /if \(!sources\.length\)/);
});

test('research report history is owner scoped and protected by RLS', () => {
  assert.match(route, /from\('research_reports'\)[\s\S]*\.eq\('user_id', auth\.user\.id\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /jsonb_typeof\(sources\) = 'array'/i);
});
