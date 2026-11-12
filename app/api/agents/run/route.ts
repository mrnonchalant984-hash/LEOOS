import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { classifyAgents, getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { enforceDimensionRateLimit, enforceIpRateLimit, enforceUserRateLimit } from '@/lib/rate-limit';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { agentAllowed, canUseManualAgents, getAllowedAgentIds } from '@/lib/agents/entitlements';
import { canWriteOrganization, getOrganizationRole } from '@/lib/organization-access';
import { withOperationalMonitoring } from '@/lib/monitoring';
import { AGENT_TASK_MAX_CHARS } from '@/lib/agents/contracts';
import { createDagPlan, executeDag, type DagPlan } from '@/lib/agents/dag-planner';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'agent.run', async ({ reportFailure }) => {
  try {
    const ctx = await getProfile(req);
    if (!ctx) return NextResponse.json({ error: 'Sign in required for agent execution.' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const task = typeof body?.task === 'string' ? body.task.trim() : '';
    if (!task) return NextResponse.json({ error: 'Task is required.' }, { status: 400 });
    if (task.length > AGENT_TASK_MAX_CHARS) {
      return NextResponse.json({ error: `Agent tasks are limited to ${AGENT_TASK_MAX_CHARS} characters.` }, { status: 413 });
    }

    const limited = await enforceUserRateLimit(ctx.user.id, 'agent-run', 10, 60);
    if (limited) return limited;
    const ipLimited = await enforceIpRateLimit(req, 'agent-run-ip', 60, 60);
    if (ipLimited) return ipLimited;

    const requested = typeof body?.agent_id === 'string' ? getAgent(body.agent_id) : null;
    if (body?.agent_id && !requested) return NextResponse.json({ error: 'The requested agent is not available.' }, { status: 404 });
    if (requested && (requested.id === 'image' || requested.id === 'video')) return NextResponse.json({ error: 'Generation tools must be started through their dedicated credit-protected endpoints.' }, { status: 400 });

    const owner = isPlatformOwner(ctx.profile);
    const userPlan = await getEffectiveUserPlan(ctx.user.id, owner);
    const requestsBrandImage = /\b(generate|create|make|render)\b.{0,48}\b(image|picture|photo|visual|mockup|logo)\b/i.test(task);
    if (requestsBrandImage && requested?.id !== 'branding') return NextResponse.json({ error: 'Image generation uses the dedicated, credit-protected endpoint. Use the Image Generation mode or explicitly choose the Branding Agent for a brand visual.' }, { status: 400 });
    if (/\b(generate|create|make|render)\b.{0,40}\b(video|clip|film)\b/i.test(task)) return NextResponse.json({ error: 'Video generation uses the dedicated, credit-protected endpoint. Use the Video Generation mode.' }, { status: 400 });
    if (body.async === true && requestsBrandImage) return NextResponse.json({ error: 'Brand image generation requires an interactive run so credit reservation and the saved asset can be confirmed.' }, { status: 400 });
    if (!owner && !canUseManualAgents(userPlan.key, owner)) return NextResponse.json({ error: 'Manual specialist agents require a Pro or Business plan. Free users can use Leo AI chat in Auto mode.' }, { status: 403 });
    const allowedAgentIds = getAllowedAgentIds(userPlan.key, owner);
    if (requested && !agentAllowed(requested.id, userPlan.key, owner)) return NextResponse.json({ error: 'This specialist agent is not included in your current plan.' }, { status: 403 });
    const selectedAgents = requested ? [requested] : classifyAgents(task, owner, allowedAgentIds || undefined);
    const agents = selectedAgents.slice(0, 4); // Bounded specialist handoffs prevent unbounded agent fan-out.
    if (!agents.length) return NextResponse.json({ error: 'No permitted agent is available for this task.' }, { status: 403 });
    if (agents.some((agent) => agent.ownerOnly && !owner)) {
      return NextResponse.json({ error: 'Owner-only agent access denied.' }, { status: 403 });
    }
    const dependencyInput = body.agent_dependencies;
    if (dependencyInput !== undefined && (!dependencyInput || typeof dependencyInput !== 'object' || Array.isArray(dependencyInput))) {
      return NextResponse.json({ error: 'Agent dependencies must be an object keyed by selected agent ID.' }, { status: 400 });
    }
    const selectedIds = new Set(agents.map(item => item.id));
    let dagPlan: DagPlan<{ id: string; dependsOn: string[] }>;
    try {
      const dependenciesByAgent = dependencyInput as Record<string, unknown> | undefined;
      if (dependenciesByAgent && Object.keys(dependenciesByAgent).some(id => !selectedIds.has(id))) {
        throw new Error('Dependencies can only reference selected agents.');
      }
      dagPlan = createDagPlan(agents.map((item, index) => {
        const dependencies = dependenciesByAgent
          ? dependenciesByAgent[item.id] ?? []
          : index === 0 ? [] : [agents[index - 1].id];
        if (!Array.isArray(dependencies) || dependencies.length > 4
          || dependencies.some(dependency => typeof dependency !== 'string' || !selectedIds.has(dependency))) {
          throw new Error(`Invalid dependency list for selected agent ${item.id}.`);
        }
        return { id: item.id, dependsOn: dependencies as string[] };
      }), 2);
    } catch {
      return NextResponse.json({ error: 'Agent dependency graph is invalid or cyclic.' }, { status: 400 });
    }

    const db = adminSupabase();
    const agent = agents[0];
    const approvalAgent = agents.find((item) => item.approvalRequired);
    const organizationId = typeof body.organization_id === 'string' ? body.organization_id : null;
    if (organizationId) {
      const organizationRole = await getOrganizationRole(ctx.user.id, organizationId);
      if (!canWriteOrganization(organizationRole)) return NextResponse.json({ error: 'You do not have permission to run agents in this organization.' }, { status: 403 });
      const organizationLimited = await enforceDimensionRateLimit(req, `organization:${organizationId}`, 'agent-org', owner ? 240 : 120, 3600);
      if (organizationLimited) return organizationLimited;
    }
    const planLimited = await enforceDimensionRateLimit(req, `plan:${userPlan.key}`, 'agent-plan', owner ? 1000 : userPlan.key === 'business' || userPlan.key === 'unlimited' ? 240 : userPlan.key === 'pro' ? 120 : 30, 3600);
    if (planLimited) return planLimited;
    const providerLimit = owner ? 120 : userPlan.key === 'pro' ? 40 : userPlan.key === 'business' || userPlan.key === 'unlimited' ? 80 : 15;
    const providerLimited = await enforceUserRateLimit(ctx.user.id, `agent-provider-${agent.id}`, providerLimit, 3600);
    if (providerLimited) return providerLimited;
    const context = typeof body.context === 'string' ? body.context.slice(0, 18_000) : '';

    if (body.async === true && !approvalAgent) {
      const { data: queuedRun, error: queuedRunError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: agent.id,
        task,
        status: 'queued',
        ...(organizationId ? { organization_id: organizationId } : {}),
        metadata: {
          context,
          requested_agents: agents.map((item) => item.id),
          execution_mode: 'durable_worker',
          execution_plan: dagPlan.nodes,
        },
      }).select('id').single();
      if (queuedRunError) throw queuedRunError;
      const { error: jobError } = await db.from('agent_jobs').insert({ run_id: queuedRun.id, user_id: ctx.user.id });
      if (jobError) throw jobError;
      const { error: queuedEventError } = await db.from('agent_execution_events').insert({
        run_id: queuedRun.id,
        user_id: ctx.user.id,
        event_type: 'run_queued',
        payload: { agent_ids: agents.map(item => item.id) },
      });
      if (queuedEventError) {
        console.error('Queued agent event could not be saved:', queuedEventError.message);
      }
      return NextResponse.json({ status: 'queued', run_id: queuedRun.id, agent: { id: agent.id, name: agent.name } }, { status: 202 });
    }

    if (approvalAgent) {
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: approvalAgent.id,
        task,
        status: 'waiting_approval',
        ...(organizationId ? { organization_id: organizationId } : {}),
        metadata: { context, requested_agents: [approvalAgent.id] },
      }).select('id').single();
      if (runError) throw runError;

      const { data: approval, error: approvalError } = await db.from('agent_approvals').insert({
        run_id: run.id,
        user_id: ctx.user.id,
        action: `Run ${approvalAgent.name}`,
        status: 'pending',
        metadata: { agent_id: approvalAgent.id, task, context },
      }).select('id').single();
      if (approvalError) throw approvalError;

      return NextResponse.json({
        status: 'waiting_approval',
        approval_id: approval.id,
        run_id: run.id,
        agent: { id: approvalAgent.id, name: approvalAgent.name },
        approval_required: true,
        message: `${approvalAgent.name} requires your approval before execution.`,
      });
    }

    const outputs = new Map<string, string>();
    const outcomes = await executeDag(dagPlan, async node => {
      const currentAgent = agents.find(item => item.id === node.id);
      if (!currentAgent) throw new Error('Planned agent is no longer available.');
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: currentAgent.id,
        task,
        status: 'running',
        started_at: new Date().toISOString(),
        metadata: { dag_dependencies: node.dependsOn },
        ...(organizationId ? { organization_id: organizationId } : {}),
      }).select('id,metadata').single();
      if (runError) throw runError;
      const { error: eventStartError } = await db.from('agent_execution_events').insert({
        run_id: run.id,
        user_id: ctx.user.id,
        event_type: 'run_started',
        payload: { agent_id: currentAgent.id, dependencies: node.dependsOn },
      });
      if (eventStartError) {
        await db.from('agent_runs').update({
          status: 'failed',
          error: 'Execution timeline could not be initialized.',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        throw new Error('Agent execution could not be recorded.');
      }

      const handoffs = node.dependsOn.map(id => {
        const dependencyAgent = agents.find(item => item.id === id);
        return `[UNTRUSTED SPECIALIST HANDOFF: ${dependencyAgent?.name ?? id} -> ${currentAgent.name}]\n${(outputs.get(id) || '').slice(0, 5000)}`;
      }).join('\n\n');
      const nodeContext = `${context.slice(0, 9000)}${handoffs ? `\n\n${handoffs}` : ''}`.slice(-18000);
      try {
        const result = await runAgent(currentAgent, task, nodeContext, owner, {
          runId: run.id,
          userId: ctx.user.id,
          request: req,
          persistAgentRun: true,
        });
        const parsed = parseAgentExecutionResult(result);
        const verifiedOutput = parsed?.result || result;
        const { error: updateError } = await db.from('agent_runs').update({
          status: parsed?.status === 'waiting_owner_input' ? 'waiting_approval' : 'completed',
          result: verifiedOutput,
          completed_at: parsed?.status === 'waiting_owner_input' ? null : new Date().toISOString(),
          metadata: {
            ...(run.metadata || {}),
            browser_session_id: parsed?.session_id || null,
            browser_approvals: parsed?.approvals || [],
            dag_dependencies: node.dependsOn,
          },
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        if (updateError) throw updateError;
        const { error: eventCompleteError } = await db.from('agent_execution_events').insert({
          run_id: run.id,
          user_id: ctx.user.id,
          event_type: parsed?.status === 'waiting_owner_input' ? 'run_waiting_input' : 'run_completed',
          payload: { agent_id: currentAgent.id, result_saved: true, dependencies: node.dependsOn },
        });
        if (eventCompleteError) console.error('Agent completion event could not be saved:', eventCompleteError.message);
        outputs.set(node.id, String(verifiedOutput).slice(0, 5000));
        return {
          run_id: run.id,
          agent: currentAgent.id,
          name: currentAgent.name,
          result: verifiedOutput,
          status: parsed?.status || 'completed',
          session_id: parsed?.session_id,
          approvals: parsed?.approvals,
          dependencies: node.dependsOn,
        };
      } catch (error) {
        await db.from('agent_runs').update({
          status: 'failed',
          error: 'Agent execution failed. Retry the run or review provider availability.',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        throw error;
      }
    }, result => result.status !== 'waiting_owner_input');

    const results = outcomes.flatMap(outcome => outcome.status === 'completed' ? [outcome.value] : []);
    const waiting = results.find(result => result.status === 'waiting_owner_input');
    if (waiting) {
      return NextResponse.json({
        status: 'waiting_owner_input', results, run_id: waiting.run_id,
        session_id: waiting.session_id, approvals: waiting.approvals,
        message: 'A specialist is waiting for owner input.',
      });
    }
    const failed = outcomes.filter(outcome => outcome.status !== 'completed');
    if (failed.length) throw new Error(`Agent DAG finished with ${failed.length} failed or blocked node(s).`);
    return NextResponse.json({
      status: 'completed',
      orchestration: {
        selected_agent_count: agents.length,
        max_agents_per_request: 4,
        max_concurrency: dagPlan.maxConcurrency,
        handoff_mode: dependencyInput === undefined ? 'bounded_sequential' : 'dependency_dag',
      },
      results,
    });
  } catch (error) {
    reportFailure(error, 'google');
    return NextResponse.json({ error: 'Agent execution failed. Review the run history and try again.' }, { status: 500 });
  }
  });
}
