import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';
import { publicAgentSummary } from '@/lib/agents/manager';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { getAllowedAgentIds } from '@/lib/agents/entitlements';
import { isProviderConfigured } from '@/lib/ai/model-catalog';

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
    const [runs, approvals, meetings, tasks] = await Promise.all([
      db.from('agent_runs').select('id,agent_id,task,status,created_at,started_at,completed_at,error').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30),
      db.from('agent_approvals').select('id,status,created_at,action').eq('user_id', ctx.user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(30),
      db.from('workforce_meetings').select('id,title,status,created_at,updated_at,completed_at').eq('user_id', ctx.user.id).order('updated_at', { ascending: false }).limit(10),
      db.from('workflows').select('id,status').eq('user_id', ctx.user.id).limit(100),
    ]);
    // Optional feature tables may not exist until the included migration is applied.
    const meetingRows = meetings.error ? [] : (meetings.data || []);
    const runRows = runs.error ? [] : (runs.data || []);
    const approvalRows = approvals.error ? [] : (approvals.data || []);
    const workflowRows = tasks.error ? [] : (tasks.data || []);
    return NextResponse.json({
      role_catalog: PROFESSIONAL_ROLES.map(({ number, id, name, department, category, description, capabilities, tools, permissions, approvalRequired }) => ({ number, id, name, department, category, description, capabilities, tools, permissions, approvalRequired })),
      operational_agents: agents,
      runs: runRows,
      approvals: approvalRows,
      meetings: meetingRows,
      metrics: {
        role_definitions: PROFESSIONAL_ROLES.length,
        operational_agents: agents.length,
        running_tasks: runRows.filter(run => ['running', 'in_progress'].includes(run.status)).length,
        queued_tasks: runRows.filter(run => ['queued', 'planned', 'assigned'].includes(run.status)).length,
        completed_tasks: runRows.filter(run => run.status === 'completed').length,
        failed_tasks: runRows.filter(run => run.status === 'failed').length,
        pending_approvals: approvalRows.length,
        saved_meetings: meetingRows.length,
        workflows: workflowRows.length,
      },
      plan: plan.key,
      manual_agent_access: allowed === null || allowed.length > 0,
      limitations: {
        role_catalog_is_not_tool_authorization: true,
        local_inference_configured: Boolean(process.env.LEO_LOCAL_MODEL_URL),
        durable_agent_worker_enabled: process.env.WORKFORCE_WORKER_ENABLED === 'true' && Boolean(process.env.CRON_SECRET),
        meeting_model_configured: isProviderConfigured('openai') || isProviderConfigured('google') || isProviderConfigured('local'),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The workforce dashboard could not be loaded. Apply the included workforce migration if meeting tables are missing.' }, { status: 503 });
  }
}
