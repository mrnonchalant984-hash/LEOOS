import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { createSkillBundleZip, parseSkillBundleZip } from '../lib/skills/bundle.ts';

const markdown = `---\nname: weather-data\ndescription: Read a weather data source\nversion: 1.2.0\n---\n\nRead weather data safely.`;

test('skill bundle ZIP round trips instructions, references, scripts, and binary assets with metadata', async () => {
  const source = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const bytes = await createSkillBundleZip({
    name: 'weather-data', version: '1.2.0', description: 'Read a weather data source',
    files: {
      'SKILL.md': markdown,
      'references/api.md': 'Use the public forecast endpoint.',
      'scripts/check.mjs': 'console.log("ready")',
      'assets/icon.png': `leonardx:base64:${Buffer.from(source).toString('base64')}`,
    },
  });
  const bundle = await parseSkillBundleZip(bytes);
  assert.equal(bundle.name, 'weather-data');
  assert.equal(bundle.version, '1.2.0');
  assert.equal(bundle.files['references/api.md'], 'Use the public forecast endpoint.');
  assert.equal(bundle.files['scripts/check.mjs'], 'console.log("ready")');
  assert.equal(bundle.files['assets/icon.png'], `leonardx:base64:${Buffer.from(source).toString('base64')}`);
});

test('skill ZIP parser rejects unsupported files, bad manifests, and mismatched frontmatter', async () => {
  const unsupported = new JSZip();
  unsupported.file('.leonardx-skill.json', JSON.stringify({ format: 'leonardx-skill', formatVersion: 1, name: 'weather-data', version: '1.2.0' }));
  unsupported.file('weather-data/SKILL.md', markdown);
  unsupported.file('weather-data/README.md', 'unexpected');
  await assert.rejects(parseSkillBundleZip(await unsupported.generateAsync({ type: 'uint8array' })), /unsupported file path/);

  const mismatch = new JSZip();
  mismatch.file('.leonardx-skill.json', JSON.stringify({ format: 'leonardx-skill', formatVersion: 1, name: 'weather-data', version: '2.0.0' }));
  mismatch.file('weather-data/SKILL.md', markdown);
  await assert.rejects(parseSkillBundleZip(await mismatch.generateAsync({ type: 'uint8array' })), /does not match/);
});

test('skill APIs and UI preserve ownership, version history, explicit execution consent, and real logs', async () => {
  const importRoute = await readFile(new URL('../app/api/skills/import/route.ts', import.meta.url), 'utf8');
  const exportRoute = await readFile(new URL('../app/api/skills/[name]/export/route.ts', import.meta.url), 'utf8');
  const updateRoute = await readFile(new URL('../app/api/skills/[name]/route.ts', import.meta.url), 'utf8');
  const historyRoute = await readFile(new URL('../app/api/skills/[name]/history/route.ts', import.meta.url), 'utf8');
  const executionRoute = await readFile(new URL('../app/api/skills/[name]/executions/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261111100000_skill_versions_and_executions.sql', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../components/skills/SkillManager.tsx', import.meta.url), 'utf8');
  for (const route of [importRoute, exportRoute, updateRoute, historyRoute, executionRoute]) assert.match(route, /getProfile/);
  assert.match(exportRoute, /eq\('owner_id', auth\.user\.id\)/);
  assert.match(updateRoute, /update_user_skill_bundle/);
  assert.match(historyRoute, /skill_versions/);
  assert.match(executionRoute, /skill_executions/);
  assert.match(migration, /alter table public\.skill_versions enable row level security/i);
  assert.match(migration, /alter table public\.skill_executions enable row level security/i);
  assert.match(ui, /Import skill ZIP/);
  assert.match(ui, /Save new version/);
  assert.match(ui, /Run isolated script/);
  assert.match(ui, /Refresh execution logs/);
});
