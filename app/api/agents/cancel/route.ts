import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import {
  agentApprovalMatchesRun,
  cancelPendingAgentApproval,
  expirePendingAgentApproval,
  isAgentApprovalExpired,
} from '@/lib/agents/approval-policy';
import { getAgent } from '@/lib/agents/manager';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const approvalId = typeof body?.approval_id === 'string' ? body.approval_id : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approvalId)) {
    return NextResponse.json({ error: 'Provide a valid approval ID.' }, { status: 400 });
  }

  const db = adminSupabase();
  const { data: approval, error: approvalError } = await db.from('agent_approvals')
    .select('id,run_id,action,metadata,status,created_at')
    .eq('id', approvalId).eq('user_id', ctx.user.id).eq('status', 'pending').maybeSingle();
  if (approvalError) return NextResponse.json({ error: 'Approval could not be checked.' }, { status: 503 });
  if (!approval) return NextResponse.json({ error: 'Approval not found or already resolved.' }, { status: 404 });
  if (isAgentApprovalExpired(approval.created_at)) {
    const { error } = await expirePendingAgentApproval(db, approvalId, ctx.user.id);
    if (error) return NextResponse.json({ error: 'Expired approval could not be recorded.' }, { status: 503 });
    return NextResponse.json({ error: 'This approval has expired.' }, { status: 410 });
  }
  if (!approval.run_id || typeof approval.metadata?.agent_id !== 'string') {
    return NextResponse.json({ error: 'Approval is not bound to a valid agent run.' }, { status: 409 });
  }
  const agent = getAgent(approval.metadata.agent_id);
  if (!agent) return NextResponse.json({ error: 'The approved agent is no longer available.' }, { status: 409 });
  const { data: run, error: runError } = await db.from('agent_runs')
    .select('id,agent_id,task,status')
    .eq('id', approval.run_id).eq('user_id', ctx.user.id).eq('status', 'waiting_approval').maybeSingle();
  if (runError) return NextResponse.json({ error: 'The approved agent run could not be checked.' }, { status: 503 });
  if (!run || !agentApprovalMatchesRun(approval, run, `Run ${agent.name}`)) {
    return NextResponse.json({ error: 'Approval does not match an active agent run.' }, { status: 409 });
  }

  const { data: claimed, error: claimError } = await cancelPendingAgentApproval(db, approvalId, ctx.user.id);
  if (claimError) return NextResponse.json({ error: 'Approval could not be cancelled.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ error: 'Approval was expired or resolved by another request.' }, { status: 409 });
  const { data: cancelledRun, error: cancelError } = await db.from('agent_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', approval.run_id).eq('user_id', ctx.user.id).eq('status', 'waiting_approval')
    .select('id').maybeSingle();
  if (cancelError || !cancelledRun) {
    console.error('Cancelled agent run state could not be persisted', cancelError?.message || 'Run state changed.');
    return NextResponse.json({ error: 'Approval was cancelled, but its agent run could not be updated.' }, { status: 503 });
  }
  return NextResponse.json({ status: 'cancelled' });
}
