import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/research/route.ts', import.meta.url), 'utf8');
const search = await readFile(new URL('../lib/ai/web-search.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261111160000_research_reports.sql', import.meta.url), 'utf8');

test('standalone research uses authenticated Gemini synthesis and an independent bounded web-search provider', () => {
  assert.match(route, /getProfile\(req\)/);
  assert.match(route, /enforceUserRateLimit/);
  assert.match(route, /searchWeb\(query\)/);
  assert.match(route, /getDefaultTextModel\('research'\)/);
  assert.doesNotMatch(route, /webSearch:\s*true/);
  assert.match(route, /fetchPublicHtml/);
  assert.match(route, /slice\(0, 5\)/);
  assert.match(route, /validatePublicSiteUrl/);
  assert.match(route, /if \(!sources\.length\)/);
});

test('web search fails closed when unconfigured or quota-limited and never selects a paid fallback', () => {
  assert.match(search, /TAVILY_API_KEY/);
  assert.match(search, /status === 429|response\.status === 429/);
  assert.match(search, /No paid fallback/);
  assert.match(search, /https:\/\/api\.tavily\.com\/search/);
});

test('research report history is owner scoped and protected by RLS', () => {
  assert.match(route, /from\('research_reports'\)[\s\S]*\.eq\('user_id', auth\.user\.id\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /jsonb_typeof\(sources\) = 'array'/i);
});
