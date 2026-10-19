import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { classifyAgents, getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { enforceDimensionRateLimit, enforceIpRateLimit, enforceUserRateLimit } from '@/lib/rate-limit';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { agentAllowed, canUseManualAgents, getAllowedAgentIds } from '@/lib/agents/entitlements';
import { canWriteOrganization, getOrganizationRole } from '@/lib/organization-access';
import { withOperationalMonitoring } from '@/lib/monitoring';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'agent.run', async ({ reportFailure }) => {
  try {
    const ctx = await getProfile(req);
    if (!ctx) return NextResponse.json({ error: 'Sign in required for agent execution.' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const task = typeof body?.task === 'string' ? body.task.trim() : '';
    if (!task) return NextResponse.json({ error: 'Task is required.' }, { status: 400 });

    const limited = await enforceUserRateLimit(ctx.user.id, 'agent-run', 10, 60);
    if (limited) return limited;
    const ipLimited = await enforceIpRateLimit(req, 'agent-run-ip', 60, 60);
    if (ipLimited) return ipLimited;

    const requested = typeof body?.agent_id === 'string' ? getAgent(body.agent_id) : null;
    if (body?.agent_id && !requested) return NextResponse.json({ error: 'The requested agent is not available.' }, { status: 404 });
    if (requested && (requested.id === 'image' || requested.id === 'video')) return NextResponse.json({ error: 'Generation tools must be started through their dedicated credit-protected endpoints.' }, { status: 400 });

    const owner = isPlatformOwner(ctx.profile);
    const plan = await getEffectiveUserPlan(ctx.user.id, owner);
    if (/\b(generate|create|make|render)\b.{0,40}\b(image|picture|photo|visual)\b/i.test(task)) return NextResponse.json({ error: 'Image generation uses the dedicated, credit-protected endpoint. Use the Image Generation mode.' }, { status: 400 });
    if (/\b(generate|create|make|render)\b.{0,40}\b(video|clip|film)\b/i.test(task)) return NextResponse.json({ error: 'Video generation uses the dedicated, credit-protected endpoint. Use the Video Generation mode.' }, { status: 400 });
    if (!owner && !canUseManualAgents(plan.key, owner)) return NextResponse.json({ error: 'Manual specialist agents require a Pro or Business plan. Free users can use Leo AI chat in Auto mode.' }, { status: 403 });
    const allowedAgentIds = getAllowedAgentIds(plan.key, owner);
    if (requested && !agentAllowed(requested.id, plan.key, owner)) return NextResponse.json({ error: 'This specialist agent is not included in your current plan.' }, { status: 403 });
    const selectedAgents = requested ? [requested] : classifyAgents(task, owner, allowedAgentIds || undefined);
    const agents = selectedAgents.slice(0, 4); // Bounded specialist handoffs prevent unbounded agent fan-out.
    if (!agents.length) return NextResponse.json({ error: 'No permitted agent is available for this task.' }, { status: 403 });
    if (agents.some((agent) => agent.ownerOnly && !owner)) {
      return NextResponse.json({ error: 'Owner-only agent access denied.' }, { status: 403 });
    }

    const db = adminSupabase();
    const agent = agents[0];
    const organizationId = typeof body.organization_id === 'string' ? body.organization_id : null;
    if (organizationId) {
      const organizationRole = await getOrganizationRole(ctx.user.id, organizationId);
      if (!canWriteOrganization(organizationRole)) return NextResponse.json({ error: 'You do not have permission to run agents in this organization.' }, { status: 403 });
      const organizationLimited = await enforceDimensionRateLimit(req, `organization:${organizationId}`, 'agent-org', owner ? 240 : 120, 3600);
      if (organizationLimited) return organizationLimited;
    }
    const planLimited = await enforceDimensionRateLimit(req, `plan:${plan.key}`, 'agent-plan', owner ? 1000 : plan.key === 'business' || plan.key === 'unlimited' ? 240 : plan.key === 'pro' ? 120 : 30, 3600);
    if (planLimited) return planLimited;
    const providerLimit = owner ? 120 : plan.key === 'pro' ? 40 : plan.key === 'business' || plan.key === 'unlimited' ? 80 : 15;
    const providerLimited = await enforceUserRateLimit(ctx.user.id, `agent-provider-${agent.id}`, providerLimit, 3600);
    if (providerLimited) return providerLimited;
    const context = typeof body.context === 'string' ? body.context.slice(0, 18_000) : '';

    if (body.async === true) {
      const { data: queuedRun, error: queuedRunError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: agent.id,
        task,
        status: 'queued',
        ...(organizationId ? { organization_id: organizationId } : {}),
        metadata: { context, requested_agents: agents.map((item) => item.id), execution_mode: 'durable_worker' },
      }).select('id').single();
      if (queuedRunError) throw queuedRunError;
      const { error: jobError } = await db.from('agent_jobs').insert({ run_id: queuedRun.id, user_id: ctx.user.id });
      if (jobError) throw jobError;
      return NextResponse.json({ status: 'queued', run_id: queuedRun.id, agent: { id: agent.id, name: agent.name } }, { status: 202 });
    }

    if (agent.approvalRequired) {
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: agent.id,
        task,
        status: 'waiting_approval',
        ...(organizationId ? { organization_id: organizationId } : {}),
        metadata: { context, requested_agents: agents.map((item) => item.id) },
      }).select('id').single();
      if (runError) throw runError;

      const { data: approval, error: approvalError } = await db.from('agent_approvals').insert({
        run_id: run.id,
        user_id: ctx.user.id,
        action: `Run ${agent.name}`,
        status: 'pending',
        metadata: { agent_id: agent.id, task, context },
      }).select('id').single();
      if (approvalError) throw approvalError;

      return NextResponse.json({
        status: 'waiting_approval',
        approval_id: approval.id,
        run_id: run.id,
        agent: { id: agent.id, name: agent.name },
        approval_required: true,
        message: `${agent.name} requires your approval before execution.`,
      });
    }

    const results = [];
    let sharedContext = context;
    for (const currentAgent of agents) {
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: currentAgent.id,
        task,
        status: 'running',
        started_at: new Date().toISOString(),
        ...(organizationId ? { organization_id: organizationId } : {}),
      }).select('id,metadata').single();
      if (runError) throw runError;

      try {
        const result = await runAgent(currentAgent, task, sharedContext, owner, { runId: run.id, userId: ctx.user.id });
        const parsed = parseAgentExecutionResult(result);
        const waitingForOwner = parsed?.status === 'waiting_owner_input';
        const verifiedOutput = parsed?.result || result;
        results.push({
          run_id: run.id,
          agent: currentAgent.id,
          name: currentAgent.name,
          result: verifiedOutput,
          status: parsed?.status || 'completed',
          session_id: parsed?.session_id,
          approvals: parsed?.approvals,
        });
        // Pass a bounded, explicitly untrusted handoff to the next specialist.
        sharedContext = `${sharedContext.slice(0, 9000)}\n\n[UNTRUSTED SPECIALIST HANDOFF: ${currentAgent.name} -> next selected specialist]\n${String(verifiedOutput).slice(0, 5000)}`.slice(-18000);

        const { error: updateError } = await db.from('agent_runs').update({
          status: waitingForOwner ? 'waiting_approval' : 'completed',
          result: parsed?.result || result,
          completed_at: waitingForOwner ? null : new Date().toISOString(),
          metadata: {
            ...(run.metadata || {}),
            browser_session_id: parsed?.session_id || null,
            browser_approvals: parsed?.approvals || [],
          },
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        if (updateError) throw updateError;

        if (waitingForOwner) {
          return NextResponse.json({
            status: 'waiting_owner_input',
            results,
            run_id: run.id,
            session_id: parsed.session_id,
            approvals: parsed.approvals,
            message: parsed.message,
          });
        }
      } catch (error) {
        await db.from('agent_runs').update({
          status: 'failed',
          error: 'Agent execution failed. Retry the run or review provider availability.',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        throw error;
      }
    }

    return NextResponse.json({ status: 'completed', orchestration: { selected_agent_count: agents.length, max_agents_per_request: 4, handoff_mode: agents.length > 1 ? 'bounded_sequential' : 'single_agent' }, results });
  } catch (error) {
    reportFailure(error, 'openai');
    return NextResponse.json({ error: 'Agent execution failed. Review the run history and try again.' }, { status: 500 });
  }
  });
}
