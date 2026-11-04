import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, getProfile, isPlatformOwner } from "@/lib/auth";
import { getEffectiveUserPlan } from "@/lib/plan-access";
import { agentAllowed } from "@/lib/agents/entitlements";
import {
  getAgent,
  runAgent,
  parseAgentExecutionResult,
} from "@/lib/agents/manager";
import {
  agentApprovalMatchesRun,
  claimPendingAgentApproval,
  expirePendingAgentApproval,
  isAgentApprovalExpired,
} from "@/lib/agents/approval-policy";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const ctx = await getProfile(req);
    if (!ctx)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const approvalId = typeof body?.approval_id === "string" ? body.approval_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approvalId))
      return NextResponse.json(
        { error: "Provide a valid approval ID." },
        { status: 400 },
      );
    const db = adminSupabase();
    const { data: approval, error: approvalReadError } = await db
      .from("agent_approvals")
      .select("*")
      .eq("id", approvalId)
      .eq("user_id", ctx.user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (approvalReadError) return NextResponse.json({ error: "Approval could not be checked." }, { status: 503 });
    if (!approval)
      return NextResponse.json(
        { error: "Approval not found or already resolved" },
        { status: 404 },
      );
    if (isAgentApprovalExpired(approval.created_at)) {
      const { error: expireError } = await expirePendingAgentApproval(db, approvalId, ctx.user.id);
      if (expireError) return NextResponse.json({ error: "Expired approval could not be recorded." }, { status: 503 });
      return NextResponse.json({ error: "This approval has expired. Start a new request to continue." }, { status: 410 });
    }
    const agentId = approval.metadata?.agent_id;
    const agent = getAgent(agentId);
    if (!agent)
      return NextResponse.json(
        { error: "Agent no longer exists" },
        { status: 400 },
      );
    if (!approval.run_id || typeof approval.metadata?.task !== "string") {
      return NextResponse.json({ error: "Approval is not bound to a valid agent run." }, { status: 409 });
    }
    const { data: run, error: runReadError } = await db.from("agent_runs")
      .select("id,agent_id,task,status")
      .eq("id", approval.run_id)
      .eq("user_id", ctx.user.id)
      .eq("status", "waiting_approval")
      .maybeSingle();
    if (runReadError) return NextResponse.json({ error: "The approved agent run could not be checked." }, { status: 503 });
    if (!run || !agentApprovalMatchesRun(approval, run, `Run ${agent.name}`)) {
      return NextResponse.json({ error: "Approval does not match an active agent run." }, { status: 409 });
    }
    const owner = isPlatformOwner(ctx.profile);
    const plan = await getEffectiveUserPlan(ctx.user.id, owner);
    if (!agentAllowed(agent.id, plan.key, owner)) return NextResponse.json({ error: 'This specialist agent is not included in your current plan.' }, { status: 403 });
    if (agent.id === 'image' || agent.id === 'video') return NextResponse.json({ error: 'Generation tools must be started through their dedicated credit-protected endpoints.' }, { status: 400 });
    if (agent.ownerOnly && !owner)
      return NextResponse.json(
        { error: "Owner-only agent access denied" },
        { status: 403 },
      );
    const { data: claimedApproval, error: claimError } = await claimPendingAgentApproval(db, approvalId, ctx.user.id);
    if (claimError) return NextResponse.json({ error: "Approval could not be claimed." }, { status: 503 });
    if (!claimedApproval) return NextResponse.json({ error: "Approval was expired or resolved by another request." }, { status: 409 });
    const { data: startedRun, error: startError } = await db.from("agent_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", approval.run_id)
      .eq("user_id", ctx.user.id)
      .eq("status", "waiting_approval")
      .select("id")
      .maybeSingle();
    if (startError || !startedRun) {
      const { error: approvalFailure } = await db.from("agent_approvals")
        .update({ status: "failed" })
        .eq("id", approvalId).eq("user_id", ctx.user.id).eq("status", "approved");
      if (approvalFailure) console.error("Agent approval failure state could not be persisted", approvalFailure.message);
      if (startError) console.error("Approved agent run could not be started", startError.message);
      return NextResponse.json({ error: "The approved agent run could not be started." }, { status: startError ? 503 : 409 });
    }
    try {
      const result = await runAgent(
        agent,
        approval.metadata?.task || "",
        approval.metadata?.context || "",
        owner,
        { runId: approval.run_id, userId: ctx.user.id },
      );
      const parsed = parseAgentExecutionResult(result);
      if (parsed?.status === "waiting_owner_input") {
        const { data: waitingRun, error: waitingError } = await db
          .from("agent_runs")
          .update({
            status: "waiting_approval",
            result: parsed.message || result,
            metadata: {
              ...(approval.metadata || {}),
              browser_session_id: parsed.session_id,
              browser_approvals: parsed.approvals || [],
            },
          })
          .eq("id", approval.run_id).eq("user_id", ctx.user.id).eq("status", "running")
          .select("id").maybeSingle();
        if (waitingError || !waitingRun) {
          console.error("Waiting agent result could not be persisted", waitingError?.message || "Run state changed.");
          return NextResponse.json({ error: "Agent requires follow-up, but its run state could not be persisted." }, { status: 503 });
        }
        return NextResponse.json({
          status: "waiting_owner_input",
          run_id: approval.run_id,
          session_id: parsed.session_id,
          approvals: parsed.approvals,
          message: parsed.message,
          agent: { id: agent.id, name: agent.name },
        });
      }
      const { data: completedRun, error: completionError } = await db
        .from("agent_runs")
        .update({
          status: "completed",
          result,
          completed_at: new Date().toISOString(),
        })
        .eq("id", approval.run_id).eq("user_id", ctx.user.id).eq("status", "running")
        .select("id").maybeSingle();
      if (completionError || !completedRun) {
        console.error("Completed agent result could not be persisted", completionError?.message || "Run state changed.");
        return NextResponse.json({ error: "Agent completed, but its result could not be safely recorded." }, { status: 503 });
      }
      return NextResponse.json({
        status: "completed",
        result,
        agent: { id: agent.id, name: agent.name },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Agent failed";
      const [{ error: runFailure }, { error: approvalFailure }] = await Promise.all([
        db
        .from("agent_runs")
        .update({
          status: "failed",
          error,
          completed_at: new Date().toISOString(),
        })
        .eq("id", approval.run_id).eq("user_id", ctx.user.id).eq("status", "running"),
        db
        .from("agent_approvals")
        .update({ status: "failed" })
        .eq("id", approvalId).eq("user_id", ctx.user.id).eq("status", "approved"),
      ]);
      if (runFailure || approvalFailure) {
        console.error("Agent approval failure state could not be fully persisted", { run: runFailure?.message, approval: approvalFailure?.message });
        return NextResponse.json({ error: "Agent execution failed and its final status could not be fully recorded." }, { status: 503 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Approval failed" },
      { status: 500 },
    );
  }
}
