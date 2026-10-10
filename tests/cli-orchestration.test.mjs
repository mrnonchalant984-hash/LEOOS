import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendScratchpad, isPathAllowed, readScratchpad, strategies } from '../packages/cli/src/orchestration.mjs';

test('CLI strategy map has all three protocols and confines agent file paths', () => {
  assert.deepEqual(strategies, ['disjoint-directory', 'git-worktree', 'shared-scratchpad']);
  assert.equal(isPathAllowed('database', 'supabase/migrations/a.sql'), true);
  assert.equal(isPathAllowed('database', 'components/ui/a.tsx'), false);
  assert.equal(isPathAllowed('ui', 'components/ui/a.tsx'), true);
  assert.equal(isPathAllowed('ui', '../../.env'), false);
});

test('scratchpad serializes compact metadata and is readable before follow-up work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leo-scratchpad-'));
  try {
    await appendScratchpad(root, { id: '1', taskId: 'task-1', agent: 'database', createdAt: new Date().toISOString(), summary: 'Added a migration contract', changedPaths: ['supabase/migrations/001.sql'], validation: { status: 'not-run', checks: [] } });
    const manifest = await readScratchpad(root);
    assert.equal(manifest.entries[0].changedPaths[0], '/supabase/migrations/001.sql');
    assert.equal(JSON.parse(await readFile(join(root, '.leo', 'scratchpad.json'), 'utf8')).entries.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
