import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';
import { publicAgentSummary } from '@/lib/agents/manager';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { getAllowedAgentIds } from '@/lib/agents/entitlements';
import { isProviderConfigured } from '@/lib/ai/model-catalog';
import { AGENT_APPROVAL_TTL_MS } from '@/lib/agents/approval-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  try {
    const owner = true;
    const plan = await getEffectiveUserPlan(ctx.user.id, owner);
    const allowed = getAllowedAgentIds(plan.key, owner);
    const agents = publicAgentSummary(owner).filter(agent => allowed === null || allowed.includes(agent.id));
    const db = adminSupabase();
    const [runs, approvals, meetings, tasks, events] = await Promise.all([
      db.from('agent_runs').select('id,agent_id,task,status,created_at,started_at,completed_at,error,result').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30),
      db.from('agent_approvals').select('id,status,created_at,action').eq('user_id', ctx.user.id).eq('status', 'pending')
        .gt('created_at', new Date(Date.now() - AGENT_APPROVAL_TTL_MS).toISOString()).order('created_at', { ascending: false }).limit(30),
      db.from('workforce_meetings').select('id,title,status,created_at,updated_at,completed_at').eq('user_id', ctx.user.id).order('updated_at', { ascending: false }).limit(10),
      db.from('workflows').select('id,status').eq('user_id', ctx.user.id).limit(100),
      db.from('agent_execution_events').select('id,run_id,event_type,payload,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (runs.error || approvals.error) return NextResponse.json({ error: 'Agent runs and approvals could not be loaded.' }, { status: 503 });
    if (events.error) return NextResponse.json({ error: 'UAI execution events could not be loaded. Apply the current execution lifecycle migration.' }, { status: 503 });
    const meetingRows = meetings.error ? [] : (meetings.data || []);
    const runRows = runs.error ? [] : (runs.data || []);
    const approvalRows = approvals.error ? [] : (approvals.data || []);
    const workflowRows = tasks.error ? [] : (tasks.data || []);
    const runIds = runRows.map(run => run.id);
    const { data: jobs, error: jobsError } = runIds.length
      ? await db.from('agent_jobs').select('run_id,status,attempts,checkpoint').eq('user_id', ctx.user.id).in('run_id', runIds)
      : { data: [], error: null };
    if (jobsError) return NextResponse.json({ error: 'Durable execution checkpoints could not be loaded.' }, { status: 503 });
    const jobByRun = new Map((jobs || []).map(job => [job.run_id, job]));
    const enrichedRuns = runRows.map(run => {
      const job = jobByRun.get(run.id);
      return {
        ...run,
        result: typeof run.result === 'string' ? run.result.slice(0, 12000) : null,
        job_status: job?.status ?? null,
        attempts: job?.attempts ?? null,
        completed_nodes: Object.keys(job?.checkpoint?.completed_nodes ?? {}),
      };
    });
    const artifacts = runRows.filter(run => typeof run.result === 'string' && run.result.length > 0)
      .map(run => ({ run_id: run.id, agent_id: run.agent_id, kind: 'saved_run_result', created_at: run.completed_at || run.created_at, preview: run.result.slice(0, 1000) }));
    return NextResponse.json({
      role_catalog: PROFESSIONAL_ROLES.map(({ number, id, name, department, category, description, capabilities, tools, permissions, approvalRequired }) => ({ number, id, name, department, category, description, capabilities, tools, permissions, approvalRequired })),
      operational_agents: agents,
      runs: enrichedRuns,
      approvals: approvalRows,
      meetings: meetingRows,
      events: events.data || [],
      artifacts,
      metrics: {
        role_definitions: PROFESSIONAL_ROLES.length,
        operational_agents: agents.length,
        running_tasks: runRows.filter(run => ['running', 'pausing', 'cancelling', 'in_progress'].includes(run.status)).length,
        queued_tasks: runRows.filter(run => ['queued', 'planned', 'assigned'].includes(run.status)).length,
        paused_tasks: jobByRun.size ? [...jobByRun.values()].filter(job => job.status === 'paused').length : 0,
        completed_tasks: runRows.filter(run => run.status === 'completed').length,
        failed_tasks: runRows.filter(run => run.status === 'failed').length,
        pending_approvals: approvalRows.length,
        execution_events: (events.data || []).length,
        saved_artifacts: artifacts.length,
        saved_meetings: meetingRows.length,
        workflows: workflowRows.length,
      },
      plan: plan.key,
      manual_agent_access: allowed === null || allowed.length > 0,
      limitations: {
        role_catalog_is_not_tool_authorization: true,
        gemini_provider_configured: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()),
        durable_agent_worker_enabled: process.env.WORKFORCE_WORKER_ENABLED === 'true' && Boolean(process.env.CRON_SECRET),
        meeting_model_configured: isProviderConfigured('google'),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The workforce dashboard could not be loaded. Apply the included workforce migration if meeting tables are missing.' }, { status: 503 });
  }
}
