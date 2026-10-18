import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GODOT_PROJECT_ASSET_MAX_BYTES, validateGodotAssetPath, validateGodotImageBytes } from '../lib/builders/godot-assets.ts';

test('Godot image assets require a safe assets/ path and a supported extension', () => {
  assert.deepEqual(validateGodotAssetPath('assets/textures/pitch.png'), {
    path: 'assets/textures/pitch.png',
    extension: '.png',
    mimeType: 'image/png',
  });
  assert.equal(validateGodotAssetPath('../secret.png'), null);
  assert.equal(validateGodotAssetPath('assets/../secret.png'), null);
  assert.equal(validateGodotAssetPath('assets/.env'), null);
  assert.equal(validateGodotAssetPath('res://textures/pitch.png'), null);
  assert.equal(validateGodotAssetPath('assets/model.glb'), null);
});

test('Godot image asset validation checks signature, MIME, and size and creates a content hash', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const valid = validateGodotImageBytes('assets/texture.png', 'image/png', png);
  assert.equal(valid?.sizeBytes, png.length);
  assert.match(valid?.sha256 || '', /^[a-f0-9]{64}$/);
  assert.equal(validateGodotImageBytes('assets/texture.png', 'image/jpeg', png), null);
  assert.equal(validateGodotImageBytes('assets/texture.jpg', 'image/jpeg', png), null);
  assert.equal(validateGodotImageBytes('assets/texture.png', 'image/png', Buffer.alloc(GODOT_PROJECT_ASSET_MAX_BYTES + 1)), null);
});

test('game asset API stores private, bounded image data and Godot builds recheck its checksum', async () => {
  const upload = await readFile(new URL('../app/api/builds/godot/assets/route.ts', import.meta.url), 'utf8');
  const build = await readFile(new URL('../app/api/builds/godot/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261018160000_godot_project_assets.sql', import.meta.url), 'utf8');
  assert.match(upload, /getBuildActor\(req, 'mcp:write'\)/);
  assert.match(upload, /BUCKET = 'leo-files'/);
  assert.match(upload, /validateGodotImageBytes/);
  assert.match(upload, /attach_godot_project_asset/);
  assert.match(build, /godot_project_assets/);
  assert.match(build, /verified\.sha256 !== link\.sha256/);
  assert.match(build, /GODOT_ASSET_MANIFEST_PATH/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /project_path ~ '\^assets\//);
});
