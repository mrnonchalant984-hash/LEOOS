import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { agentAllowed, canUseManualAgents } from '@/lib/agents/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
      await db.from('agent_jobs').update({ status: 'failed', last_error: 'Agent definition unavailable.', locked_at: null, locked_by: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
      continue;
    }
    const { error: startError } = await db.from('agent_runs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
    if (startError) {
      await db.from('agent_jobs').update({ status: attempt < 3 ? 'queued' : 'failed', available_at: new Date(Date.now() + attempt * 30_000).toISOString(), locked_at: null, locked_by: null, lease_expires_at: null, last_error: 'Run state could not be updated.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
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
      const { error: resultError } = await db.from('agent_runs').update({ status: waiting ? 'waiting_approval' : 'completed', result: parsed?.result || result, completed_at: waiting ? null : new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
      if (resultError) throw new Error('result_persistence_failed');
      const { error: jobError } = await db.from('agent_jobs').update({ status: waiting ? 'failed' : 'succeeded', last_error: waiting ? 'Run requires owner input.' : null, locked_at: null, locked_by: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
      if (jobError) throw new Error('job_persistence_failed');
      processed += 1;
    } catch (cause) {
      const code = cause instanceof Error && /^[a-z_]{3,64}$/.test(cause.message) ? cause.message : 'agent_execution_failed';
      const retry = attempt < 3 && !['agent_entitlement_revoked'].includes(code);
      await db.from('agent_runs').update({ status: retry ? 'queued' : 'failed', error: retry ? null : 'Agent execution failed or access was revoked.', completed_at: retry ? null : new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
      await db.from('agent_jobs').update({ status: retry ? 'queued' : 'failed', available_at: retry ? new Date(Date.now() + attempt * 30_000).toISOString() : now, locked_at: null, locked_by: null, lease_expires_at: null, last_error: code, updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
    }
  }
  return NextResponse.json({ processed, claimed: jobs?.length || 0, worker_id: workerId }, { headers: { 'Cache-Control': 'no-store' } });
}
