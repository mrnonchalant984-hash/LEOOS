import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { canUseManualAgents, getAllowedAgentIds } from '@/lib/agents/entitlements';
import { classifyAgents, runAgent } from '@/lib/agents/manager';
import { isBrowserAgent } from '@/lib/agents/browser-agent-disabled';
import {
  getReadyWorkflowStepBatch,
  topologicallySortWorkflowSteps,
  workflowDependencyError,
  type WorkflowDependencyStep,
} from '@/lib/workflow-dependencies';
import {
  completedWorkflowStepIds,
  parseWorkflowStepResults,
  setWorkflowStepResult,
  type WorkflowStepResult,
} from '@/lib/workflow-run-state';

export const runtime = 'nodejs';
export const maxDuration = 60;
const safe = (value: unknown) => typeof value === 'string' ? value : '';
const PARALLEL_READ_ONLY_TOOLS = new Set([
  'calendar_read',
  'database_read',
  'document_read',
  'file_read',
  'github_read',
  'knowledge_read',
  'project_read',
  'public_site_audit',
  'repository_read',
  'web_search',
]);

type PlannedStep = WorkflowDependencyStep & {
  task: string;
  agents: ReturnType<typeof classifyAgents>;
};

function isReadOnlyStep(plan: PlannedStep) {
  return plan.agents.every(agent =>
    agent.allowedTools.every(tool => PARALLEL_READ_ONLY_TOOLS.has(tool)),
  );
}

async function executeWorkflowStep(
  plan: PlannedStep,
  context: string,
  owner: boolean,
  runId: string,
  userId: string,
) {
  const stepOutputs: string[] = [];
  for (const agent of plan.agents) {
    const output = await runAgent(agent, plan.task, context, owner, { runId, userId });
    stepOutputs.push(`${agent.name}: ${output}`);
  }
  return stepOutputs.join('\n\n').slice(0, 12_000);
}

function authorized(req: NextRequest) {
  const configuredSecrets = [process.env.WORKFLOW_WORKER_SECRET, process.env.CRON_SECRET].filter((value): value is string => Boolean(value && value.length >= 32));
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!configuredSecrets.length || !token) return false;
  const supplied = createHmac('sha256', token).update('leonardx-workflow-worker').digest();
  return configuredSecrets.some((secret) => timingSafeEqual(createHmac('sha256', secret).update('leonardx-workflow-worker').digest(), supplied));
}

/** Invoke from a trusted scheduler/worker only. It never accepts arbitrary code or arbitrary URLs. */
export async function POST(req: NextRequest) {
  if (process.env.WORKFLOW_WORKER_ENABLED !== 'true') return NextResponse.json({ error: 'Workflow worker is disabled.' }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized worker.' }, { status: 401 });
  const request = await req.json().catch(() => ({}));
  const limit = Number.isInteger(request?.limit) ? Math.max(1, Math.min(1, request.limit)) : 1;
  const workerId = `workflow-worker-${randomUUID()}`;
  const db = adminSupabase();
  const { error: scheduleError } = await db.rpc('enqueue_due_workflows', { p_limit: 10 });
  if (scheduleError) return NextResponse.json({ error: 'Schedule scan failed. Verify the workflow migration and service-role grants.' }, { status: 503 });
  const { data: jobs, error: claimError } = await db.rpc('claim_workflow_jobs', { p_worker: workerId, p_limit: limit, p_lease_seconds: 300 });
  if (claimError) return NextResponse.json({ error: 'Queue claim failed. Verify the workflow migration and service-role grants.' }, { status: 503 });
  const results: Array<{ run_id: string; status: string }> = [];

  for (const job of jobs ?? []) {
    const runId = safe(job.run_id);
    try {
      const { data: run, error: runError } = await db.from('workflow_runs').select('id,user_id,workflow_id,input,output,status,attempt_count').eq('id', runId).maybeSingle();
      if (runError || !run) throw new Error('run_not_found');
      if (run.status === 'cancelled') throw new Error('workflow_cancelled');
      if (!['queued', 'running'].includes(run.status)) throw new Error('workflow_run_unavailable');
      const { data: workflow, error: workflowError } = await db.from('workflows').select('id,user_id,status,definition').eq('id', run.workflow_id).eq('user_id', run.user_id).maybeSingle();
      if (workflowError || !workflow || workflow.status === 'paused' || workflow.status === 'archived') throw new Error('workflow_unavailable');
      const { data: profile } = await db.from('profiles').select('role,email').eq('id', run.user_id).maybeSingle();
      const owner = isPlatformOwner(profile);
      const plan = await getEffectiveUserPlan(run.user_id, owner);
      if (!canUseManualAgents(plan.key, owner)) throw new Error('plan_entitlement_denied');
      const allowed = getAllowedAgentIds(plan.key, owner);
      const rawSteps = (workflow.definition as { steps?: unknown[] } | null)?.steps;
      if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 5) throw new Error('invalid_workflow_definition');
      let steps: WorkflowDependencyStep[];
      const dependencyError = workflowDependencyError(rawSteps as WorkflowDependencyStep[]);
      if (dependencyError) throw new Error('invalid_workflow_dependencies');
      try { steps = topologicallySortWorkflowSteps(rawSteps as WorkflowDependencyStep[]); }
      catch { throw new Error('invalid_workflow_dependencies'); }
      const stepPlans: PlannedStep[] = steps.map((step) => {
        const task = safe(step.config?.task).trim();
        if (step.type !== 'agent' || !task || task.length > 4000 || !Array.isArray(step.dependsOn ?? [])) {
          throw new Error('unsupported_workflow_step');
        }
        const agents = classifyAgents(task, owner, allowed || undefined)
          .filter((agent) => agent.id !== 'image' && agent.id !== 'video' && !isBrowserAgent(agent))
          .slice(0, 4);
        if (!agents.length) throw new Error('no_permitted_agent');
        if (agents.some((agent) => agent.ownerOnly && !owner)) throw new Error('agent_entitlement_denied');
        return { ...step, task, agents };
      });
      const validStepIds = new Set(stepPlans.map(step => step.id));
      const restoredOutputs = parseWorkflowStepResults(run.output, validStepIds);
      if (!restoredOutputs) throw new Error('invalid_workflow_progress');
      let outputs: WorkflowStepResult[] = restoredOutputs;
      const { data: startedRun, error: startError } = await db.from('workflow_runs').update({
        status: 'running',
        started_at: new Date().toISOString(),
        attempt_count: (run.attempt_count ?? 0) + 1,
      }).eq('id', runId).eq('user_id', run.user_id).in('status', ['queued', 'running']).select('id').maybeSingle();
      if (startError || !startedRun) throw new Error('workflow_cancelled');
      let context = JSON.stringify(run.input ?? {}).slice(0, 18_000);
      const completedStepIds = completedWorkflowStepIds(outputs);
      for (const output of outputs) {
        if (output.status === 'succeeded' && output.output) {
          context = `${context}\n\n[UNTRUSTED PREVIOUS WORKFLOW OUTPUT: ${output.step_id}]\n${output.output}`.slice(-18_000);
        }
      }
      let waitingForApproval = false;
      while (completedStepIds.size < stepPlans.length) {
        const { data: currentRun, error: statusError } = await db.from('workflow_runs')
          .select('status').eq('id', runId).eq('user_id', run.user_id).maybeSingle();
        if (statusError) throw new Error('workflow_status_unavailable');
        if (!currentRun || currentRun.status === 'cancelled') throw new Error('workflow_cancelled');
        if (currentRun.status !== 'running') throw new Error('workflow_run_unavailable');

        const batch = getReadyWorkflowStepBatch(
          stepPlans,
          completedStepIds,
          isReadOnlyStep,
          3,
        );
        if (!batch.length) throw new Error('invalid_workflow_dependencies');
        const approvalStep = batch.find(plan =>
          plan.agents.some(agent => agent.approvalRequired) &&
          !outputs.some(output => output.step_id === plan.id && output.status === 'approved'),
        );
        if (approvalStep) {
          outputs = setWorkflowStepResult(outputs, { step_id: approvalStep.id, status: 'waiting_approval' });
          const { error: checkpointError } = await db.from('workflow_runs')
            .update({ status: 'waiting_approval', output: outputs })
            .eq('id', runId).eq('user_id', run.user_id).eq('status', 'running');
          if (checkpointError) throw new Error('workflow_approval_checkpoint_failed');
          const { error: releaseError } = await db.from('workflow_jobs')
            .update({ status: 'completed', lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
            .eq('id', job.id).eq('lease_owner', workerId);
          if (releaseError) throw new Error('workflow_approval_checkpoint_failed');
          results.push({ run_id: runId, status: 'waiting_approval' });
          waitingForApproval = true;
          break;
        }

        const batchResults = await Promise.allSettled(
          batch.map(plan => executeWorkflowStep(plan, context, owner, runId, run.user_id)),
        );
        const { data: postBatchRun, error: postBatchStatusError } = await db.from('workflow_runs')
          .select('status').eq('id', runId).eq('user_id', run.user_id).maybeSingle();
        if (postBatchStatusError) throw new Error('workflow_status_unavailable');
        if (!postBatchRun || postBatchRun.status === 'cancelled') throw new Error('workflow_cancelled');
        let batchFailed = false;
        for (let index = 0; index < batch.length; index += 1) {
          const plan = batch[index];
          const result = batchResults[index];
          if (!plan || !result) throw new Error('workflow_step_failed');
          const stepId = safe(plan.id);
          completedStepIds.add(stepId);
          if (result.status === 'fulfilled') {
            const completedOutput: WorkflowStepResult = { step_id: stepId, status: 'succeeded', output: result.value };
            outputs = setWorkflowStepResult(outputs, completedOutput);
            context = `${context}\n\nWorkflow step ${stepId} output:\n${result.value}`.slice(-18_000);
          } else {
            const failedOutput: WorkflowStepResult = { step_id: stepId, status: 'failed' };
            outputs = setWorkflowStepResult(outputs, failedOutput);
            batchFailed = true;
          }
        }
        const { error: persistError } = await db.from('workflow_runs').update({ output: outputs }).eq('id', runId).eq('user_id', run.user_id);
        if (persistError) throw new Error('output_persistence_failed');
        if (batchFailed) throw new Error('workflow_step_failed');
      }
      if (waitingForApproval) continue;
      const { data: completedRun, error: doneError } = await db.from('workflow_runs').update({
        status: 'succeeded',
        output: outputs,
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      }).eq('id', runId).eq('user_id', run.user_id).eq('status', 'running').select('id').maybeSingle();
      if (doneError || !completedRun) throw new Error('workflow_cancelled');
      await db.from('workflow_jobs').update({ status: 'completed', lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_owner', workerId);
      results.push({ run_id: runId, status: 'succeeded' });
    } catch (error) {
      const code = error instanceof Error && /^[a-z_]{3,64}$/.test(error.message) ? error.message : 'workflow_execution_failed';
      if (code === 'workflow_cancelled') {
        results.push({ run_id: runId, status: 'cancelled' });
        continue;
      }
      const attempts = Number(job.attempts ?? 1);
      const dead = attempts >= 5;
      await db.from('workflow_runs').update({ status: dead ? 'failed' : 'queued', error_code: code, error_message: 'The workflow step did not complete. Review the run and retry after resolving the issue.', ...(dead ? { completed_at: new Date().toISOString() } : {}) }).eq('id', runId).in('status', ['queued', 'running']);
      await db.from('workflow_jobs').update({ status: dead ? 'dead_letter' : 'queued', available_at: new Date(Date.now() + Math.min(3600, 15 * (2 ** Math.max(0, attempts - 1))) * 1000).toISOString(), lease_owner: null, lease_expires_at: null, last_error_code: code, updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_owner', workerId).neq('status', 'cancelled');
      results.push({ run_id: runId, status: dead ? 'dead_letter' : 'retry_queued' });
    }
  }
  return NextResponse.json({ claimed: jobs?.length ?? 0, results }, { headers: { 'Cache-Control': 'no-store' } });
}

/** GET support is for trusted schedulers (for example, a cron caller with CRON_SECRET). */
export async function GET(req: NextRequest) { return POST(req); }
