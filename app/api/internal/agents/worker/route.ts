import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { agentAllowed, canUseManualAgents } from '@/lib/agents/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    const agent = run ? getAgent(run.agent_id) : null;
    if (!run || !agent) {
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
    try {
      const { data: profile } = await db.from('profiles').select('role,email').eq('id', run.user_id).maybeSingle();
      const owner = isPlatformOwner(profile);
      const plan = await getEffectiveUserPlan(run.user_id, owner);
      if (!canUseManualAgents(plan.key, owner) || !agentAllowed(agent.id, plan.key, owner) || (agent.ownerOnly && !owner)) {
        throw new Error('agent_entitlement_revoked');
      }
      const result = await runAgent(agent, run.task, typeof run.metadata?.context === 'string' ? run.metadata.context : '', owner, { runId: run.id, userId: run.user_id });
      const parsed = parseAgentExecutionResult(result);
      const waiting = parsed?.status === 'waiting_owner_input';
      const { data: finalized, error: finalizeError } = await db.rpc('finalize_agent_job', {
        p_job_id: job.id,
        p_worker: workerId,
        p_run_status: waiting ? 'waiting_approval' : 'completed',
        p_job_status: waiting ? 'failed' : 'succeeded',
        p_result: parsed?.result || result,
        p_run_error: waiting ? 'Run requires owner input.' : null,
        p_job_error: waiting ? 'run_requires_owner_input' : null,
        p_retry_at: null,
      });
      if (finalizeError || finalized !== true) throw new Error('job_finalization_rejected');
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
