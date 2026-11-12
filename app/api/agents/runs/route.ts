import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { AGENT_APPROVAL_TTL_MS } from '@/lib/agents/approval-policy';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const db = adminSupabase();
  const [runs, approvals] = await Promise.all([
    db.from('agent_runs').select('id,agent_id,task,status,created_at,started_at,completed_at,error,result,metadata')
      .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30),
    db.from('agent_approvals').select('id,run_id,action,metadata,created_at')
      .eq('user_id', ctx.user.id).eq('status', 'pending')
      .gt('created_at', new Date(Date.now() - AGENT_APPROVAL_TTL_MS).toISOString())
      .order('created_at', { ascending: false }).limit(30),
  ]);
  if (runs.error || approvals.error) {
    return NextResponse.json({ error: 'Agent runs and approvals could not be loaded. Verify the agent execution migration is applied.' }, { status: 500 });
  }
  const runIds = (runs.data || []).map(run => run.id);
  const { data: jobs, error: jobsError } = runIds.length
    ? await db.from('agent_jobs').select('run_id,status,attempts,checkpoint').eq('user_id', ctx.user.id).in('run_id', runIds)
    : { data: [], error: null };
  if (jobsError) return NextResponse.json({ error: 'Durable run controls are unavailable. Apply the agent lifecycle migration.' }, { status: 503 });
  const jobsByRun = new Map((jobs || []).map(job => [job.run_id, job]));
  return NextResponse.json({
    runs: (runs.data || []).map(run => {
      const job = jobsByRun.get(run.id);
      return {
        ...run,
        job_status: job?.status ?? null,
        attempts: job?.attempts ?? null,
        completed_nodes: Object.keys(job?.checkpoint?.completed_nodes ?? {}),
      };
    }),
    approvals: approvals.data || [],
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
