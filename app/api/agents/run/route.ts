import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { classifyAgents, getAgent, parseAgentExecutionResult, runAgent } from '@/lib/agents/manager';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getProfile(req);
    if (!ctx) return NextResponse.json({ error: 'Sign in required for agent execution.' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const task = typeof body?.task === 'string' ? body.task.trim() : '';
    if (!task) return NextResponse.json({ error: 'Task is required.' }, { status: 400 });

    const limited = await enforceUserRateLimit(ctx.user.id, 'agent-run', 10, 60);
    if (limited) return limited;

    const requested = typeof body.agent_id === 'string' ? getAgent(body.agent_id) : null;
    if (body.agent_id && !requested) return NextResponse.json({ error: 'The requested agent is not available.' }, { status: 404 });

    const owner = isPlatformOwner(ctx.profile);
    const agents = requested ? [requested] : classifyAgents(task, owner);
    if (!agents.length) return NextResponse.json({ error: 'No permitted agent is available for this task.' }, { status: 403 });
    if (agents.some((agent) => agent.ownerOnly && !owner)) {
      return NextResponse.json({ error: 'Owner-only agent access denied.' }, { status: 403 });
    }

    const db = adminSupabase();
    const agent = agents[0];
    const context = typeof body.context === 'string' ? body.context.slice(0, 18_000) : '';

    if (agent.approvalRequired) {
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: agent.id,
        task,
        status: 'waiting_approval',
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
    for (const currentAgent of agents) {
      const { data: run, error: runError } = await db.from('agent_runs').insert({
        user_id: ctx.user.id,
        agent_id: currentAgent.id,
        task,
        status: 'running',
        started_at: new Date().toISOString(),
      }).select('id,metadata').single();
      if (runError) throw runError;

      try {
        const result = await runAgent(currentAgent, task, context, owner, { runId: run.id, userId: ctx.user.id });
        const parsed = parseAgentExecutionResult(result);
        const waitingForOwner = parsed?.status === 'waiting_owner_input';
        results.push({
          agent: currentAgent.id,
          name: currentAgent.name,
          result: parsed?.result || result,
          status: parsed?.status || 'completed',
          session_id: parsed?.session_id,
          approvals: parsed?.approvals,
        });

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
        const message = error instanceof Error ? error.message : 'Agent execution failed.';
        await db.from('agent_runs').update({
          status: 'failed',
          error: message.slice(0, 1000),
          completed_at: new Date().toISOString(),
        }).eq('id', run.id).eq('user_id', ctx.user.id);
        throw error;
      }
    }

    return NextResponse.json({ status: 'completed', results });
  } catch (error) {
    console.error('Agent execution failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Agent execution failed. Review the run history and try again.' }, { status: 500 });
  }
}
