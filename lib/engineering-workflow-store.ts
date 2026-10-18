import 'server-only';

import { adminSupabase } from '@/lib/auth';
import {
  createEngineeringWorkflow,
  canRetryStage,
  deriveWorkflowStatus,
  overallProgress,
  transitionStage,
  type EngineeringWorkflow,
  type WorkflowApplicabilityInput,
  type WorkflowMode,
  type WorkflowStageId,
  type WorkflowStatus,
  type WorkflowStageRecord,
} from '@/lib/engineering-workflow';

type DbRow = {
  id: string;
  owner_user_id: string;
  website_project_id: string | null;
  mode: WorkflowMode;
  status: WorkflowStatus;
  current_stage: WorkflowStageId | null;
  title: string;
  summary: string | null;
  strategy: Record<string, unknown> | null;
  budget_tier: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  stages: WorkflowStageRecord[];
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

function fromRow(row: DbRow): EngineeringWorkflow {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    websiteProjectId: row.website_project_id,
    mode: row.mode,
    status: row.status,
    currentStage: row.current_stage,
    title: row.title,
    summary: row.summary,
    strategy: row.strategy,
    budgetTier: row.budget_tier,
    budgetAmount: row.budget_amount,
    budgetCurrency: row.budget_currency,
    stages: Array.isArray(row.stages) ? row.stages : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  };
}

function toRow(workflow: EngineeringWorkflow) {
  return {
    id: workflow.id,
    owner_user_id: workflow.ownerUserId,
    website_project_id: workflow.websiteProjectId,
    mode: workflow.mode,
    status: workflow.status,
    current_stage: workflow.currentStage,
    title: workflow.title,
    summary: workflow.summary,
    strategy: workflow.strategy,
    budget_tier: workflow.budgetTier,
    budget_amount: workflow.budgetAmount,
    budget_currency: workflow.budgetCurrency,
    stages: workflow.stages,
    created_at: workflow.createdAt,
    updated_at: workflow.updatedAt,
    cancelled_at: workflow.cancelledAt,
  };
}

export async function insertEngineeringWorkflow(input: {
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
}): Promise<{ data: EngineeringWorkflow | null; error: string | null }> {
  const workflow = createEngineeringWorkflow(input);
  const db = adminSupabase();
  const { data, error } = await db.from('engineering_workflows').insert(toRow(workflow)).select('*').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'Another migration or deployment workflow is already active for this project.' };
    }
    return { data: null, error: 'Workflow could not be created.' };
  }
  await db.from('engineering_workflow_events').insert({
    workflow_id: workflow.id,
    owner_user_id: input.ownerUserId,
    stage: 'REQUEST_RECEIVED',
    event_type: 'workflow_created',
    message: 'Engineering workflow created.',
    artifacts: { mode: input.mode },
  });
  return { data: data ? fromRow(data as DbRow) : workflow, error: null };
}

export async function getEngineeringWorkflow(
  ownerUserId: string,
  workflowId: string,
): Promise<{ data: EngineeringWorkflow | null; error: string | null }> {
  const db = adminSupabase();
  const { data, error } = await db
    .from('engineering_workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (error) return { data: null, error: 'Workflow could not be loaded.' };
  return { data: data ? fromRow(data as DbRow) : null, error: null };
}

export async function listEngineeringWorkflows(
  ownerUserId: string,
  limit = 20,
): Promise<{ data: EngineeringWorkflow[]; error: string | null }> {
  const db = adminSupabase();
  const { data, error } = await db
    .from('engineering_workflows')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) return { data: [], error: 'Workflows could not be loaded.' };
  return { data: (data || []).map((row) => fromRow(row as DbRow)), error: null };
}

export async function updateWorkflowStage(
  ownerUserId: string,
  workflowId: string,
  stageId: WorkflowStageId,
  status: WorkflowStatus,
  details: {
    progressMessage?: string | null;
    artifacts?: Record<string, unknown>;
    error?: { code: string; message: string } | null;
  } = {},
): Promise<{ data: EngineeringWorkflow | null; error: string | null }> {
  const current = await getEngineeringWorkflow(ownerUserId, workflowId);
  if (current.error || !current.data) return { data: null, error: current.error || 'Workflow not found.' };
  if (current.data.status === 'CANCELLED') return { data: null, error: 'Cancelled workflows cannot be updated.' };

  const stages = transitionStage(current.data.stages, stageId, status, details);
  const derived = deriveWorkflowStatus(stages);
  const updated: EngineeringWorkflow = {
    ...current.data,
    stages,
    status: derived.status,
    currentStage: derived.currentStage,
    updatedAt: new Date().toISOString(),
    cancelledAt: status === 'CANCELLED' && stageId === current.data.currentStage
      ? new Date().toISOString()
      : current.data.cancelledAt,
  };

  const db = adminSupabase();
  const { data, error } = await db
    .from('engineering_workflows')
    .update(toRow(updated))
    .eq('id', workflowId)
    .eq('owner_user_id', ownerUserId)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: 'Workflow stage could not be updated.' };

  await db.from('engineering_workflow_events').insert({
    workflow_id: workflowId,
    owner_user_id: ownerUserId,
    stage: stageId,
    event_type: `stage_${status.toLowerCase()}`,
    message: details.progressMessage || `Stage ${stageId} is now ${status}.`,
    artifacts: details.artifacts || {},
  });

  return { data: data ? fromRow(data as DbRow) : updated, error: null };
}

export async function advanceEngineeringWorkflowStage(
  ownerUserId: string,
  workflowId: string,
  stageId: WorkflowStageId,
  status: WorkflowStatus,
  details: {
    progressMessage?: string | null;
    artifacts?: Record<string, unknown>;
    error?: { code: string; message: string } | null;
  } = {},
): Promise<{ data: EngineeringWorkflow | null; error: string | null }> {
  const current = await getEngineeringWorkflow(ownerUserId, workflowId);
  if (current.error || !current.data) return { data: null, error: current.error || 'Workflow not found.' };
  const workflow = current.data;
  if (workflow.status === 'CANCELLED' || workflow.status === 'COMPLETED') {
    return { data: null, error: 'This workflow is no longer active.' };
  }
  const stage = workflow.stages.find((item) => item.id === stageId);
  if (!stage || !stage.applicable) return { data: null, error: 'The requested stage is not applicable to this workflow.' };
  if (workflow.currentStage !== stageId) {
    return { data: null, error: `Stages must run in order. The current stage is ${workflow.currentStage || 'none'}.` };
  }
  if ((stage.status === 'FAILED' || stage.status === 'BLOCKED') && !canRetryStage(stage)) {
    return { data: null, error: `Stage ${stageId} is not eligible for retry.` };
  }
  if (stage.status === 'COMPLETED') return { data: null, error: `Stage ${stageId} is already complete.` };
  return updateWorkflowStage(ownerUserId, workflowId, stageId, status, details);
}

export async function cancelEngineeringWorkflow(
  ownerUserId: string,
  workflowId: string,
): Promise<{ data: EngineeringWorkflow | null; error: string | null }> {
  const current = await getEngineeringWorkflow(ownerUserId, workflowId);
  if (!current.data) return { data: null, error: current.error || 'Workflow not found.' };
  const now = new Date().toISOString();
  const stages = current.data.stages.map((stage) => {
    if (!stage.applicable) return stage;
    if (stage.status === 'COMPLETED' || stage.status === 'FAILED') return stage;
    return {
      ...stage,
      status: 'CANCELLED' as const,
      endedAt: now,
      progressMessage: 'Cancelled by user.',
    };
  });
  const updated: EngineeringWorkflow = {
    ...current.data,
    stages,
    status: 'CANCELLED',
    updatedAt: now,
    cancelledAt: now,
  };
  const db = adminSupabase();
  const { data, error } = await db
    .from('engineering_workflows')
    .update(toRow(updated))
    .eq('id', workflowId)
    .eq('owner_user_id', ownerUserId)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: 'Workflow could not be cancelled.' };
  await db.from('engineering_workflow_events').insert({
    workflow_id: workflowId,
    owner_user_id: ownerUserId,
    stage: current.data.currentStage,
    event_type: 'workflow_cancelled',
    message: 'Workflow cancelled.',
    artifacts: {},
  });
  return { data: data ? fromRow(data as DbRow) : updated, error: null };
}

export async function listWorkflowEvents(ownerUserId: string, workflowId: string, limit = 50) {
  const db = adminSupabase();
  const owned = await getEngineeringWorkflow(ownerUserId, workflowId);
  if (!owned.data) return { data: [], error: owned.error || 'Workflow not found.' };
  const { data, error } = await db
    .from('engineering_workflow_events')
    .select('id,stage,event_type,message,artifacts,created_at')
    .eq('workflow_id', workflowId)
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) return { data: [], error: 'Workflow events could not be loaded.' };
  return { data: data || [], error: null };
}

export function serializeWorkflow(workflow: EngineeringWorkflow) {
  return {
    ...workflow,
    progress: overallProgress(workflow.stages),
  };
}
