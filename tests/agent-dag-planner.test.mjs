import test from 'node:test';
import assert from 'node:assert/strict';
import { createDagPlan, executeDag } from '../lib/agents/dag-planner.ts';

test('DAG planner schedules dependencies after prerequisites and independent work in bounded batches', async () => {
  const plan = createDagPlan([
    { id: 'research', dependsOn: [] },
    { id: 'design', dependsOn: [] },
    { id: 'implementation', dependsOn: ['research', 'design'] },
    { id: 'review', dependsOn: ['implementation'] },
  ], 2);
  assert.deepEqual(plan.levels.map(level => level.map(node => node.id)), [
    ['research', 'design'],
    ['implementation'],
    ['review'],
  ]);
  let active = 0;
  let peak = 0;
  const outcomes = await executeDag(plan, async node => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return node.id;
  });
  assert.equal(peak, 2);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['completed', 'completed', 'completed', 'completed']);
});

test('DAG executor blocks dependent work after a prerequisite fails but completes independent work', async () => {
  const plan = createDagPlan([
    { id: 'source', dependsOn: [] },
    { id: 'other', dependsOn: [] },
    { id: 'dependent', dependsOn: ['source'] },
  ]);
  const outcomes = await executeDag(plan, async node => {
    if (node.id === 'source') throw new Error('failed');
    return node.id;
  });
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['failed', 'completed', 'blocked']);
  assert.deepEqual(outcomes[2], { id: 'dependent', status: 'blocked', blockedBy: ['source'] });
});

test('DAG executor stops scheduling work when a completed node requests lifecycle control', async () => {
  const plan = createDagPlan([
    { id: 'pause', dependsOn: [] },
    { id: 'later', dependsOn: [] },
    { id: 'dependent', dependsOn: ['pause'] },
  ], 1);
  const executed = [];
  const outcomes = await executeDag(plan, async node => {
    executed.push(node.id);
    return node.id === 'pause' ? 'paused' : 'completed';
  }, value => value !== 'paused');
  assert.deepEqual(executed, ['pause']);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['completed', 'blocked', 'blocked']);
});

test('DAG planner rejects invalid references, duplicate nodes, cycles, and unsafe concurrency', () => {
  assert.throws(() => createDagPlan([{ id: 'a', dependsOn: ['missing'] }]), /dependencies are invalid/);
  assert.throws(() => createDagPlan([{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }]), /cycle/);
  assert.throws(() => createDagPlan([{ id: 'a', dependsOn: [] }, { id: 'a', dependsOn: [] }]), /identity/);
  assert.throws(() => createDagPlan([{ id: 'a', dependsOn: [] }], 5), /concurrency/);
});
