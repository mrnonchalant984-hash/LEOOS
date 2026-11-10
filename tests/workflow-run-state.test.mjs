import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  completedWorkflowStepIds,
  parseWorkflowStepResults,
  setWorkflowStepResult,
} from '../lib/workflow-run-state.ts';

test('workflow progress is bounded, validated, and rejects unknown step references', () => {
  const ids = new Set(['inspect', 'build']);
  const sixIds = new Set(Array.from({ length: 6 }, (_, index) => `step-${index}`));
  assert.deepEqual(parseWorkflowStepResults(null, ids), []);
  assert.equal(parseWorkflowStepResults([{ step_id: 'other', status: 'succeeded' }], ids), null);
  assert.equal(parseWorkflowStepResults([{ step_id: 'inspect', status: 'unknown' }], ids), null);
  assert.equal(parseWorkflowStepResults([{ step_id: 'inspect', status: 'succeeded', output: 'x'.repeat(12_001) }], ids), null);
  assert.equal(parseWorkflowStepResults(Array.from({ length: 6 }, (_, index) => ({
    step_id: `step-${index}`,
    status: 'failed',
  })), sixIds), null);
});

test('workflow retry resumes successful steps and replaces failed checkpoints', () => {
  const ids = new Set(['inspect', 'build']);
  const restored = parseWorkflowStepResults([
    { step_id: 'inspect', status: 'succeeded', output: 'verified inspection' },
    { step_id: 'build', status: 'failed' },
  ], ids);
  assert.ok(restored);
  assert.deepEqual([...completedWorkflowStepIds(restored)], ['inspect']);
  const retried = setWorkflowStepResult(restored, {
    step_id: 'build',
    status: 'succeeded',
    output: 'verified build',
  });
  assert.equal(retried.length, 2);
  assert.deepEqual([...completedWorkflowStepIds(retried)], ['inspect', 'build']);
});

test('durable workflow worker checkpoints approvals and resumes only approved steps', async () => {
  const worker = await readFile(new URL('../app/api/internal/workflow-worker/route.ts', import.meta.url), 'utf8');
  const route = await readFile(new URL('../app/api/workflows/[id]/runs/[runId]/route.ts', import.meta.url), 'utf8');
  assert.match(worker, /status: 'waiting_approval'/);
  assert.match(route, /status: parsed\.data\.decision === 'approve' \? 'approved' : 'rejected'/);
  assert.match(worker, /parseWorkflowStepResults/);
  assert.match(worker, /completedWorkflowStepIds/);
  assert.match(worker, /UNTRUSTED PREVIOUS WORKFLOW OUTPUT/);
  assert.match(route, /decision: z\.enum\(\['approve', 'reject', 'cancel', 'retry'\]\)/);
  assert.match(route, /eq\('status', 'waiting_approval'\)/);
  assert.match(route, /eq\('status', 'dead_letter'\)/);
});
