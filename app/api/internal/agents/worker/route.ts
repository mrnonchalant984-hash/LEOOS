import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';

export const runtime = 'nodejs';
export const maxDuration = 60;
const JOB_LEASE_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.AGENT_WORKER_ENABLED !== 'true') return NextResponse.json({ processed: 0, disabled: true });

  const db = adminSupabase();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - JOB_LEASE_MS).toISOString();
  // Recover jobs whose worker disappeared after claiming them. This is safe
  // because the final state updates below remain conditional on the job id.
  await db.from('agent_jobs').update({ status: 'queued', locked_at: null, locked_by: null, available_at: now, updated_at: now, last_error: 'Recovered after worker lease expired.' })
    .eq('status', 'running').lt('locked_at', staleBefore);
  const { data: jobs, error } = await db.from('agent_jobs').select('id,run_id,user_id,attempts').eq('status', 'queued').lte('available_at', now).order('created_at', { ascending: true }).limit(5);
  if (error) return NextResponse.json({ error: 'Agent queue unavailable.' }, { status: 503 });

  let processed = 0;
  for (const job of jobs || []) {
    const attempt = Number(job.attempts || 0) + 1;
    const workerId = crypto.randomUUID();
    const { data: claimed } = await db.from('agent_jobs').update({ status: 'running', attempts: attempt, locked_at: now, locked_by: workerId, updated_at: now }).eq('id', job.id).eq('status', 'queued').select('id').maybeSingle();
    if (!claimed) continue;
    const { data: run } = await db.from('agent_runs').select('id,user_id,agent_id,task,metadata').eq('id', job.run_id).eq('user_id', job.user_id).maybeSingle();
    const agent = run ? getAgent(run.agent_id) : null;
    if (!run || !agent) {
      await db.from('agent_jobs').update({ status: 'failed', last_error: 'Agent definition unavailable.', locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
      continue;
    }
    await db.from('agent_runs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
    try {
      const { data: profile } = await db.from('profiles').select('role,email').eq('id', run.user_id).maybeSingle();
      const result = await runAgent(agent, run.task, typeof run.metadata?.context === 'string' ? run.metadata.context : '', isPlatformOwner(profile), { runId: run.id, userId: run.user_id });
      const parsed = parseAgentExecutionResult(result);
      const waiting = parsed?.status === 'waiting_owner_input';
      await db.from('agent_runs').update({ status: waiting ? 'waiting_approval' : 'completed', result: parsed?.result || result, completed_at: waiting ? null : new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
      await db.from('agent_jobs').update({ status: waiting ? 'failed' : 'succeeded', last_error: waiting ? 'Run requires owner input.' : null, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
      processed += 1;
    } catch {
      const retry = attempt < 3;
      await db.from('agent_runs').update({ status: retry ? 'queued' : 'failed', error: retry ? null : 'Agent execution failed after bounded retries.', completed_at: retry ? null : new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id);
      await db.from('agent_jobs').update({ status: retry ? 'queued' : 'failed', available_at: retry ? new Date(Date.now() + attempt * 30_000).toISOString() : now, locked_at: null, locked_by: null, last_error: 'Agent execution failed.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('locked_by', workerId);
    }
  }
  return NextResponse.json({ processed, queued: jobs?.length || 0 });
}
