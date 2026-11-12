import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('image deletion requires same-origin authentication and rate limits requests', async () => {
  const route = await read('app/api/media/[id]/route.ts');
  assert.match(route, /export async function DELETE/);
  assert.match(route, /request\.headers\.get\('origin'\)/);
  assert.match(route, /getProfile\(request\)/);
  assert.match(route, /enforceUserRateLimit\(user\.user\.id, 'media-asset-delete'/);
});

test('media downloads return attachments while share URLs remain expiring and private', async () => {
  const route = await read('app/api/media/[id]/route.ts');
  const sharing = await read('lib/client/share-private-media.ts');
  assert.match(route, /createSignedUrl\([\s\S]*isDownload \? \{ download: true \} : undefined/);
  assert.match(route, /60 \* 60/);
  assert.match(route, /getProfile\(request\)/);
  assert.match(sharing, /navigator\.share/);
  assert.match(sharing, /navigator\.clipboard\.writeText/);
  assert.match(sharing, /This private link expires in one hour/);
});

test('Leo workspace and Studio expose user-scoped image download and share actions', async () => {
  const widget = await read('components/LEOWidget.tsx');
  const studio = await read('components/studio/StudioWorkspace.tsx');
  assert.match(widget, /Download image/);
  assert.match(widget, /Share image/);
  assert.match(widget, /sharePrivateImage\(assetId\)/);
  assert.match(studio, /Download result/);
  assert.match(studio, /Share image/);
  assert.match(studio, /sharePrivateImage\(asset\.id\)/);
});

test('image deletion is owner-scoped and limited to completed generated images', async () => {
  const route = await read('app/api/media/[id]/route.ts');
  assert.match(route, /\.eq\('id', id\)\.eq\('user_id', user\.user\.id\)/);
  assert.match(route, /asset\.kind !== 'image' \|\| asset\.bucket !== BUCKET \|\| !asset\.job_id/);
  assert.match(route, /job\.job_type !== 'image' \|\| job\.status !== 'completed'/);
  assert.match(route, /job\.metadata\?\.asset_id !== asset\.id/);
  assert.match(route, /storage\.from\(asset\.bucket\)\.remove\(\[asset\.storage_path\]\)/);
  assert.match(route, /\.eq\('id', asset\.id\)\.eq\('user_id', user\.user\.id\)/);
  assert.match(route, /asset_deleted_at/);
});

test('Studio exposes image deletion controls and removes deleted results from its active view', async () => {
  const studio = await read('components/studio/StudioWorkspace.tsx');
  assert.match(studio, /method: 'DELETE'/);
  assert.match(studio, /Permanently delete this generated image/);
  assert.match(studio, /activeAsset\?\.id === asset\.id/);
  assert.match(studio, /Delete image/);
});

test('credit-account backfill does not alter existing balances or grant credits', async () => {
  const migration = await read('supabase/migrations/20261112120000_backfill_platform_credit_accounts.sql');
  assert.match(migration, /left join public\.platform_credit_accounts/i);
  assert.match(migration, /where account\.user_id is null/i);
  assert.match(migration, /select profile\.id, 0, 0, 0/i);
  assert.match(migration, /on conflict \(user_id\) do nothing/i);
  assert.doesNotMatch(migration, /50|welcome|total_granted\s*=\s*total_granted\s*\+/i);
});
