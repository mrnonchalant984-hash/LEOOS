/**
 * Persistent autonomous engineering workflow model for LeonardX.
 * Stages are applied selectively; progress must come from real stage transitions.
 */

export const WORKFLOW_STAGE_IDS = [
  'REQUEST_RECEIVED',
  'REQUIREMENTS_DISCOVERY',
  'REPOSITORY_INSPECTION',
  'PROJECT_STRATEGY',
  'USER_APPROVAL_WHEN_REQUIRED',
  'IMPLEMENTATION_PLANNING',
  'CHECKPOINT_CREATED',
  'CODE_IMPLEMENTATION',
  'STATIC_VALIDATION',
  'ENVIRONMENT_CONFIGURATION',
  'INTEGRATION_VALIDATION',
  'DATABASE_VALIDATION',
  'MIGRATION_EXECUTION',
  'AUTOMATED_TESTING',
  'PRODUCTION_BUILD',
  'DEPLOYMENT',
  'POST_DEPLOYMENT_VERIFICATION',
  'COMPLETION_REPORT',
] as const;

export type WorkflowStageId = (typeof WORKFLOW_STAGE_IDS)[number];

export const WORKFLOW_STATUSES = [
  'PENDING',
  'RUNNING',
  'WAITING_FOR_USER',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowMode = 'discovery' | 'autonomous';

export type WorkflowStageRecord = {
  id: WorkflowStageId;
  label: string;
  status: WorkflowStatus;
  applicable: boolean;
  startedAt: string | null;
  endedAt: string | null;
  progressMessage: string | null;
  artifacts: Record<string, unknown>;
  error: { code: string; message: string } | null;
  retryEligible: boolean;
  recoveryStrategy: string | null;
};

export type EngineeringWorkflow = {
  id: string;
  ownerUserId: string;
  websiteProjectId: string | null;
  mode: WorkflowMode;
  status: WorkflowStatus;
  currentStage: WorkflowStageId | null;
  title: string;
  summary: string | null;
  strategy: Record<string, unknown> | null;
  budgetTier: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  stages: WorkflowStageRecord[];
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
};

export type WorkflowApplicabilityInput = {
  mode: WorkflowMode;
  hasRepository: boolean;
  needsDatabase: boolean;
  needsMigrations: boolean;
  needsDeployment: boolean;
  needsEnvironmentConfig: boolean;
  needsIntegrations: boolean;
  requiresUserApproval: boolean;
};

const STAGE_META: Record<WorkflowStageId, { label: string; recoveryStrategy: string }> = {
  REQUEST_RECEIVED: { label: 'Request received', recoveryStrategy: 'Restart from a new request if creation failed.' },
  REQUIREMENTS_DISCOVERY: { label: 'Requirements discovery', recoveryStrategy: 'Resume unanswered discovery questions.' },
  REPOSITORY_INSPECTION: { label: 'Repository inspection', recoveryStrategy: 'Re-run read-only inspection.' },
  PROJECT_STRATEGY: { label: 'Project strategy', recoveryStrategy: 'Regenerate strategy from saved answers.' },
  USER_APPROVAL_WHEN_REQUIRED: { label: 'User approval', recoveryStrategy: 'Wait for explicit approval before continuing.' },
  IMPLEMENTATION_PLANNING: { label: 'Implementation planning', recoveryStrategy: 'Rebuild the plan from the approved strategy.' },
  CHECKPOINT_CREATED: { label: 'Checkpoint created', recoveryStrategy: 'Create a new Git branch checkpoint.' },
  CODE_IMPLEMENTATION: { label: 'Code implementation', recoveryStrategy: 'Resume from the last verified file change.' },
  STATIC_VALIDATION: { label: 'Static validation', recoveryStrategy: 'Re-run lint/typecheck after fixing reported issues.' },
  ENVIRONMENT_CONFIGURATION: { label: 'Environment configuration', recoveryStrategy: 'Complete missing variables via the secure config panel.' },
  INTEGRATION_VALIDATION: { label: 'Integration validation', recoveryStrategy: 'Retry safe provider health checks.' },
  DATABASE_VALIDATION: { label: 'Database validation', recoveryStrategy: 'Re-inspect schema without applying migrations.' },
  MIGRATION_EXECUTION: { label: 'Migration execution', recoveryStrategy: 'Require explicit re-approval; never blindly re-run applied migrations.' },
  AUTOMATED_TESTING: { label: 'Automated testing', recoveryStrategy: 'Re-run the failed test suite only.' },
  PRODUCTION_BUILD: { label: 'Production build', recoveryStrategy: 'Rebuild after fixing compile errors.' },
  DEPLOYMENT: { label: 'Deployment', recoveryStrategy: 'Require confirmation before another production deploy.' },
  POST_DEPLOYMENT_VERIFICATION: { label: 'Post-deployment verification', recoveryStrategy: 'Re-run health checks against the deployed URL.' },
  COMPLETION_REPORT: { label: 'Completion report', recoveryStrategy: 'Regenerate the report from stored artifacts.' },
};

export function buildApplicableStages(input: WorkflowApplicabilityInput): WorkflowStageId[] {
  const stages: WorkflowStageId[] = ['REQUEST_RECEIVED'];

  if (input.mode === 'discovery' || !input.hasRepository) {
    stages.push('REQUIREMENTS_DISCOVERY');
  }
  if (input.hasRepository) stages.push('REPOSITORY_INSPECTION');
  stages.push('PROJECT_STRATEGY');
  if (input.requiresUserApproval || input.mode === 'discovery') {
    stages.push('USER_APPROVAL_WHEN_REQUIRED');
  }
  stages.push('IMPLEMENTATION_PLANNING', 'CHECKPOINT_CREATED', 'CODE_IMPLEMENTATION', 'STATIC_VALIDATION');
  if (input.needsEnvironmentConfig) stages.push('ENVIRONMENT_CONFIGURATION');
  if (input.needsIntegrations) stages.push('INTEGRATION_VALIDATION');
  if (input.needsDatabase) stages.push('DATABASE_VALIDATION');
  if (input.needsMigrations) stages.push('MIGRATION_EXECUTION');
  stages.push('AUTOMATED_TESTING', 'PRODUCTION_BUILD');
  if (input.needsDeployment) {
    stages.push('DEPLOYMENT', 'POST_DEPLOYMENT_VERIFICATION');
  }
  stages.push('COMPLETION_REPORT');
  return stages;
}

export function createStageRecords(applicable: WorkflowStageId[]): WorkflowStageRecord[] {
  const applicableSet = new Set(applicable);
  return WORKFLOW_STAGE_IDS.map((id) => ({
    id,
    label: STAGE_META[id].label,
    status: applicableSet.has(id) ? 'PENDING' : 'CANCELLED',
    applicable: applicableSet.has(id),
    startedAt: null,
    endedAt: null,
    progressMessage: applicableSet.has(id) ? null : 'Skipped for this project.',
    artifacts: {},
    error: null,
    retryEligible: id !== 'MIGRATION_EXECUTION' && id !== 'DEPLOYMENT',
    recoveryStrategy: STAGE_META[id].recoveryStrategy,
  }));
}

export function overallProgress(stages: WorkflowStageRecord[]): {
  percent: number;
  completed: number;
  applicable: number;
  blocked: WorkflowStageId[];
  failed: WorkflowStageId[];
  nextAction: string | null;
} {
  const applicable = stages.filter((stage) => stage.applicable);
  const completed = applicable.filter((stage) => stage.status === 'COMPLETED').length;
  const blocked = applicable.filter((stage) => stage.status === 'BLOCKED').map((stage) => stage.id);
  const failed = applicable.filter((stage) => stage.status === 'FAILED').map((stage) => stage.id);
  const running = applicable.find((stage) => stage.status === 'RUNNING' || stage.status === 'WAITING_FOR_USER');
  const nextPending = applicable.find((stage) => stage.status === 'PENDING');
  const percent = applicable.length === 0 ? 0 : Math.round((completed / applicable.length) * 100);
  let nextAction: string | null = null;
  if (failed.length) nextAction = `Resolve failed stage ${failed[0]} before continuing.`;
  else if (blocked.length) nextAction = `Unblock stage ${blocked[0]}.`;
  else if (running) nextAction = running.progressMessage || `Continue ${running.label}.`;
  else if (nextPending) nextAction = `Start ${nextPending.label}.`;
  else nextAction = 'All applicable stages are complete.';
  return { percent, completed, applicable: applicable.length, blocked, failed, nextAction };
}

const DESTRUCTIVE_STAGES = new Set<WorkflowStageId>(['MIGRATION_EXECUTION', 'DEPLOYMENT']);

export function canRetryStage(stage: WorkflowStageRecord): boolean {
  if (!stage.applicable) return false;
  if (stage.status !== 'FAILED' && stage.status !== 'BLOCKED') return false;
  if (DESTRUCTIVE_STAGES.has(stage.id) && stage.artifacts?.executedOnce === true) {
    return false;
  }
  return stage.retryEligible;
}

export function transitionStage(
  stages: WorkflowStageRecord[],
  stageId: WorkflowStageId,
  status: WorkflowStatus,
  details: {
    progressMessage?: string | null;
    artifacts?: Record<string, unknown>;
    error?: { code: string; message: string } | null;
    at?: string;
  } = {},
): WorkflowStageRecord[] {
  const at = details.at || new Date().toISOString();
  return stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    if (!stage.applicable && status !== 'CANCELLED') return stage;
    const next: WorkflowStageRecord = {
      ...stage,
      status,
      progressMessage: details.progressMessage === undefined ? stage.progressMessage : details.progressMessage,
      artifacts: { ...stage.artifacts, ...(details.artifacts || {}) },
      error: details.error === undefined ? stage.error : details.error,
    };
    if (status === 'RUNNING' && !next.startedAt) next.startedAt = at;
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(status)) next.endedAt = at;
    if (DESTRUCTIVE_STAGES.has(stageId) && status === 'COMPLETED') {
      next.artifacts = { ...next.artifacts, executedOnce: true };
      next.retryEligible = false;
    }
    return next;
  });
}

export function deriveWorkflowStatus(stages: WorkflowStageRecord[]): {
  status: WorkflowStatus;
  currentStage: WorkflowStageId | null;
} {
  const applicable = stages.filter((stage) => stage.applicable);
  if (applicable.some((stage) => stage.status === 'CANCELLED') && applicable.every((stage) => stage.status === 'CANCELLED')) {
    return { status: 'CANCELLED', currentStage: null };
  }
  const failed = applicable.find((stage) => stage.status === 'FAILED');
  if (failed) return { status: 'FAILED', currentStage: failed.id };
  const blocked = applicable.find((stage) => stage.status === 'BLOCKED');
  if (blocked) return { status: 'BLOCKED', currentStage: blocked.id };
  const waiting = applicable.find((stage) => stage.status === 'WAITING_FOR_USER');
  if (waiting) return { status: 'WAITING_FOR_USER', currentStage: waiting.id };
  const running = applicable.find((stage) => stage.status === 'RUNNING');
  if (running) return { status: 'RUNNING', currentStage: running.id };
  if (applicable.every((stage) => stage.status === 'COMPLETED')) {
    return { status: 'COMPLETED', currentStage: 'COMPLETION_REPORT' };
  }
  const next = applicable.find((stage) => stage.status === 'PENDING');
  return { status: 'PENDING', currentStage: next?.id || null };
}

export function createEngineeringWorkflow(input: {
  id?: string;
  ownerUserId: string;
  websiteProjectId?: string | null;
  mode: WorkflowMode;
  title: string;
  applicability: WorkflowApplicabilityInput;
  budgetTier?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  summary?: string | null;
  strategy?: Record<string, unknown> | null;
}): EngineeringWorkflow {
  const now = new Date().toISOString();
  const applicable = buildApplicableStages(input.applicability);
  const stages = createStageRecords(applicable);
  const withFirst = transitionStage(stages, 'REQUEST_RECEIVED', 'COMPLETED', {
    progressMessage: 'Request accepted and workflow created.',
    at: now,
  });
  const derived = deriveWorkflowStatus(withFirst);
  return {
    id: input.id || globalThis.crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    websiteProjectId: input.websiteProjectId || null,
    mode: input.mode,
    status: derived.status === 'PENDING' ? 'RUNNING' : derived.status,
    currentStage: derived.currentStage,
    title: input.title.trim().slice(0, 160) || 'Untitled engineering workflow',
    summary: input.summary || null,
    strategy: input.strategy || null,
    budgetTier: input.budgetTier || null,
    budgetAmount: input.budgetAmount ?? null,
    budgetCurrency: input.budgetCurrency || null,
    stages: withFirst,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
  };
}
