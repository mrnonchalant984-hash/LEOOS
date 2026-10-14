import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('owner workspaces have their own pages and do not redirect to customer Agents', () => {
  const routes = [
    'app/workforce/page.tsx',
    'app/workforce/conversations/page.tsx',
    'app/workforce/jobs/page.tsx',
    'app/workforce/monitoring/page.tsx',
    'app/meeting-room/page.tsx',
    'app/workflows/page.tsx',
  ];
  for (const route of routes) assert.ok(fs.existsSync(path.join(root, route)), `Missing dedicated page: ${route}`);
  for (const layout of ['app/workforce/layout.tsx', 'app/meeting-room/layout.tsx']) {
    const source = read(layout);
    assert.doesNotMatch(source, /redirect\s*\(\s*['"]\/agents['"]\s*\)/);
    assert.doesNotMatch(source, /router\.(?:push|replace)\s*\(\s*['"]\/agents['"]\s*\)/);
  }
  const workforce = read('app/workforce/page.tsx');
  assert.doesNotMatch(workforce, /href:\s*['"]\/agents['"]/);
  assert.doesNotMatch(workforce, /href=['"]\/agents['"]/);
});

test('a current forward migration repairs remote pairing tables for existing databases', () => {
  const migration = read('supabase/migrations/20261014160000_remote_pairing_schema_repair.sql');
  assert.match(migration, /create table if not exists public\.leo_remote_pairings/);
  assert.match(migration, /create table if not exists public\.leo_remote_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.leo_remote_pairings from anon, authenticated/);
});
