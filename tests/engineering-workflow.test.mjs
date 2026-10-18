import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApplicableStages,
  canRetryStage,
  createEngineeringWorkflow,
  createStageRecords,
  deriveWorkflowStatus,
  overallProgress,
  transitionStage,
  WORKFLOW_STAGE_IDS,
} from '../lib/engineering-workflow.ts';

test('autonomous workflow skips discovery when a repository already exists', () => {
  const stages = buildApplicableStages({
    mode: 'autonomous',
    hasRepository: true,
    needsDatabase: true,
    needsMigrations: false,
    needsDeployment: true,
    needsEnvironmentConfig: true,
    needsIntegrations: true,
    requiresUserApproval: false,
  });
  assert.ok(!stages.includes('REQUIREMENTS_DISCOVERY'));
  assert.ok(stages.includes('REPOSITORY_INSPECTION'));
  assert.ok(stages.includes('DEPLOYMENT'));
  assert.ok(!stages.includes('MIGRATION_EXECUTION'));
});

test('progress percentage is derived only from applicable completed stages', () => {
  const applicable = buildApplicableStages({
    mode: 'discovery',
    hasRepository: false,
    needsDatabase: false,
    needsMigrations: false,
    needsDeployment: false,
    needsEnvironmentConfig: false,
    needsIntegrations: false,
    requiresUserApproval: true,
  });
  let stages = createStageRecords(applicable);
  stages = transitionStage(stages, 'REQUEST_RECEIVED', 'COMPLETED', { progressMessage: 'Received' });
  const progress = overallProgress(stages);
  assert.equal(progress.completed, 1);
  assert.ok(progress.percent > 0);
  assert.ok(progress.percent < 100);
  assert.match(progress.nextAction || '', /Start|Continue|Resolve/);
});

test('destructive stages become non-retryable after a completed execution', () => {
  let stages = createStageRecords(['MIGRATION_EXECUTION', 'DEPLOYMENT', 'COMPLETION_REPORT']);
  stages = transitionStage(stages, 'MIGRATION_EXECUTION', 'COMPLETED', {
    progressMessage: 'Migration applied once.',
  });
  const migration = stages.find((stage) => stage.id === 'MIGRATION_EXECUTION');
  assert.equal(migration?.artifacts.executedOnce, true);
  assert.equal(canRetryStage({ ...migration, status: 'FAILED' }), false);
});

test('createEngineeringWorkflow marks request received and exposes all stage ids in the model', () => {
  const workflow = createEngineeringWorkflow({
    ownerUserId: '00000000-0000-4000-8000-000000000001',
    mode: 'discovery',
    title: 'Demo workflow',
    applicability: {
      mode: 'discovery',
      hasRepository: true,
      needsDatabase: true,
      needsMigrations: true,
      needsDeployment: true,
      needsEnvironmentConfig: true,
      needsIntegrations: true,
      requiresUserApproval: true,
    },
  });
  assert.equal(workflow.stages.length, WORKFLOW_STAGE_IDS.length);
  assert.equal(workflow.stages.find((stage) => stage.id === 'REQUEST_RECEIVED')?.status, 'COMPLETED');
  const derived = deriveWorkflowStatus(workflow.stages);
  assert.ok(['PENDING', 'RUNNING', 'COMPLETED'].includes(derived.status));
});
