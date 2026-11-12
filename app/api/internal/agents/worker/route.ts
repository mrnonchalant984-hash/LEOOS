import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { agentAllowed, canUseManualAgents } from '@/lib/agents/entitlements';
import { createDagPlan, executeDag } from '@/lib/agents/dag-planner';
import type { AgentDefinition } from '@/lib/agents/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type DurableNodeResult = {
  run_id: string;
  agent: string;
  name: string;
  result: string;
  status: string;
  dependencies: string[];
  control?: string;
};

// Preserve actionable failure categories without storing provider messages,
// request headers, prompts, or any credential-bearing error text.
export function safeAgentFailureCode(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.toLowerCase() : '';
  if (message.includes('agent_entitlement_revoked')) return 'agent_entitlement_revoked';
  if (/rate.?limit|too many requests|\b429\b/.test(message)) return 'provider_rate_limited';
  if (/timed? ?out|timeout|aborterror|deadline exceeded/.test(message)) return 'provider_timeout';
  if (/invalid api key|authentication failed|unauthorized|\b401\b/.test(message)) return 'provider_authentication_failed';
  if (/agents sessions are unavailable|openai sdk.*sessions/.test(message)) return 'browser_sdk_unavailable';
  if (/browser|computer_use|agent\.session|event stream/.test(message)) return 'browser_session_failed';
  if (/empty_model_response/.test(message)) return 'empty_model_response';
  if (/^[a-z_]{3,64}$/.test(message)) return message;
  return 'agent_execution_failed';
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminSupabase();
  const now = new Date().toISOString();
  const workerId = crypto.randomUUID();
  // The database claims a job atomically with FOR UPDATE SKIP LOCKED. Expired
  // leases are reclaimed by the same function, avoiding the old select/update
  // race when multiple schedulers wake at once.
  const { data: jobs, error } = await db.rpc('claim_agent_jobs', {
    p_worker: workerId,
    p_limit: 1,
    p_lease_seconds: 90,
  });
  if (error) return NextResponse.json({ error: 'Agent queue unavailable. Apply the production worker migration.' }, { status: 503 });

  let processed = 0;
  for (const job of jobs || []) {
    const attempt = Number(job.attempts || 1);
    const { data: run } = await db.from('agent_runs').select('id,user_id,agent_id,task,metadata').eq('id', job.run_id).eq('user_id', job.user_id).maybeSingle();
    const requestedIds: string[] = Array.isArray(run?.metadata?.requested_agents)
      ? run.metadata.requested_agents.filter((id: unknown): id is string => typeof id === 'string').slice(0, 4)
      : run ? [run.agent_id] : [];
    const agents = requestedIds.map((id: string) => getAgent(id)).filter((agent): agent is AgentDefinition => Boolean(agent));
    if (!run || !agents.length || agents.length !== requestedIds.length) {
      await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: 'failed',
        p_job_status: 'failed',
        p_result: null,
        p_run_error: 'Agent definition unavailable.',
        p_job_error: 'agent_definition_unavailable',
        p_retry_at: null,
      });
      continue;
    }
    const { error: startError } = await db.from('agent_runs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
    if (startError) {
      const retry = attempt < 3;
      await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: retry ? 'queued' : 'failed',
        p_job_status: retry ? 'queued' : 'failed',
        p_result: null,
        p_run_error: retry ? null : 'Run state could not be updated.',
        p_job_error: 'run_state_update_failed',
        p_retry_at: retry ? new Date(Date.now() + attempt * 30_000).toISOString() : null,
      });
      continue;
    }
    const { error: startEventError } = await db.from('agent_execution_events').insert({
      run_id: run.id,
      user_id: run.user_id,
      event_type: 'run_started',
      payload: { agent_ids: agents.map(agent => agent.id), attempt },
    });
    if (startEventError) {
      const { error: eventFinalizeError } = await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: attempt < 3 ? 'queued' : 'failed',
        p_job_status: attempt < 3 ? 'queued' : 'failed',
        p_result: null,
        p_run_error: attempt < 3 ? null : 'Execution event could not be recorded.',
        p_job_error: 'execution_event_write_failed',
        p_retry_at: attempt < 3 ? new Date(Date.now() + attempt * 30_000).toISOString() : null,
      });
      if (eventFinalizeError) console.error('Agent start-event failure could not be finalized:', eventFinalizeError.message);
      continue;
    }
    try {
      const { data: profile } = await db.from('profiles').select('role,email').eq('id', run.user_id).maybeSingle();
      const owner = isPlatformOwner(profile);
      const plan = await getEffectiveUserPlan(run.user_id, owner);
      if (!canUseManualAgents(plan.key, owner) || agents.some(agent =>
        !agentAllowed(agent.id, plan.key, owner) || (agent.ownerOnly && !owner))) {
        throw new Error('agent_entitlement_revoked');
      }

      const savedPlan = run.metadata?.execution_plan;
      const planNodes = Array.isArray(savedPlan) ? savedPlan : agents.map((agent, index) => ({
        id: agent.id,
        dependsOn: index === 0 ? [] : [agents[index - 1].id],
      }));
      const dag = createDagPlan(planNodes as { id: string; dependsOn: string[] }[], 2);
      if (dag.nodes.length !== agents.length || dag.nodes.some(node => !agents.some(agent => agent.id === node.id))) {
        throw new Error('agent_execution_plan_invalid');
      }
      const checkpointNodes = job.checkpoint?.completed_nodes;
      const initialValues: Record<string, DurableNodeResult> = {};
      if (checkpointNodes && typeof checkpointNodes === 'object' && !Array.isArray(checkpointNodes)) {
        for (const [id, value] of Object.entries(checkpointNodes)) {
          if (agents.some(agent => agent.id === id) && value && typeof value === 'object'
            && typeof (value as Record<string, unknown>).result === 'string') {
            initialValues[id] = value as DurableNodeResult;
          }
        }
      }
      const outputs = new Map<string, string>(Object.entries(initialValues).map(([id, value]) => [id, value.result]));
      const outcomes = await executeDag(dag, async node => {
        const agent = agents.find(candidate => candidate.id === node.id);
        if (!agent) throw new Error('agent_definition_unavailable');
        const handoffs = node.dependsOn.map(id => {
          const dependency = agents.find(candidate => candidate.id === id);
          return `[UNTRUSTED SPECIALIST HANDOFF: ${dependency?.name ?? id} -> ${agent.name}]\n${(outputs.get(id) || '').slice(0, 5000)}`;
        }).join('\n\n');
        const context = `${typeof run.metadata?.context === 'string' ? run.metadata.context.slice(0, 9000) : ''}${handoffs ? `\n\n${handoffs}` : ''}`.slice(-18000);
        const result = await runAgent(agent, run.task, context, owner, { runId: run.id, userId: run.user_id });
        const parsed = parseAgentExecutionResult(result);
        const value: DurableNodeResult = {
          run_id: run.id,
          agent: agent.id,
          name: agent.name,
          result: String(parsed?.result || result).slice(0, 8000),
          status: parsed?.status || 'completed',
          dependencies: node.dependsOn,
        };
        const { data: checkpoint, error: checkpointError } = await db.rpc('record_agent_execution_checkpoint', {
          p_job_id: job.id,
          p_worker: workerId,
          p_node_id: node.id,
          p_result: value,
        });
        if (checkpointError) throw new Error('checkpoint_write_failed');
        value.control = checkpoint?.control;
        if (value.control === 'lease_lost') throw new Error('job_lease_lost');
        outputs.set(node.id, value.result);
        return value;
      }, value => value.status !== 'waiting_owner_input' && value.control !== 'paused' && value.control !== 'cancelled', initialValues);

      const interrupted = outcomes.find(outcome => outcome.status === 'completed'
        && (outcome.value.control === 'paused' || outcome.value.control === 'cancelled'));
      if (interrupted) continue;
      const results = outcomes.flatMap(outcome => outcome.status === 'completed' ? [outcome.value] : []);
      const waiting = results.some(result => result.status === 'waiting_owner_input');
      if (!waiting && outcomes.some(outcome => outcome.status !== 'completed')) throw new Error('agent_dag_dependency_failed');
      const { data: finalized, error: finalizeError } = await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: waiting ? 'waiting_approval' : 'completed',
        p_job_status: waiting ? 'failed' : 'succeeded',
        p_result: JSON.stringify(results).slice(0, 60000),
        p_run_error: waiting ? 'Run requires owner input.' : null,
        p_job_error: waiting ? 'run_requires_owner_input' : null,
        p_retry_at: null,
      });
      if (finalizeError || finalized !== true) throw new Error('job_finalization_rejected');
      const { error: completeEventError } = await db.from('agent_execution_events').insert({
        run_id: run.id,
        user_id: run.user_id,
        event_type: waiting ? 'run_waiting_input' : 'run_completed',
        payload: { agent_ids: agents.map(agent => agent.id), result_saved: true },
      });
      if (completeEventError) console.error('Agent completion event could not be saved:', completeEventError.message);
      processed += 1;
    } catch (cause) {
      const code = safeAgentFailureCode(cause);
      const retry = attempt < 3 && !['agent_entitlement_revoked'].includes(code);
      const { error: finalizeError } = await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: retry ? 'queued' : 'failed',
        p_job_status: retry ? 'queued' : 'failed',
        p_result: null,
        p_run_error: retry ? null : 'Agent execution failed or access was revoked.',
        p_job_error: code,
        p_retry_at: retry ? new Date(Date.now() + attempt * 30_000).toISOString() : null,
      });
      if (finalizeError) console.error('Agent job finalization failed; lease recovery will handle the job.', { code, jobId: job.id });
    }
  }
  return NextResponse.json({ processed, claimed: jobs?.length || 0, worker_id: workerId }, { headers: { 'Cache-Control': 'no-store' } });
}
