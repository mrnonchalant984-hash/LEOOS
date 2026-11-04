import type { adminSupabase } from '../auth';

type AdminSupabaseClient = ReturnType<typeof adminSupabase>;

export const AGENT_APPROVAL_TTL_MS = 15 * 60_000;

export function isAgentApprovalExpired(createdAt: string, now = Date.now()) {
  const createdAtMs = Date.parse(createdAt);
  return !Number.isFinite(createdAtMs) || createdAtMs > now || now - createdAtMs >= AGENT_APPROVAL_TTL_MS;
}

export function agentApprovalMatchesRun(
  approval: { action: string; metadata: unknown },
  run: { agent_id: string; task: string },
  expectedAction: string,
) {
  if (!approval.metadata || typeof approval.metadata !== 'object' || Array.isArray(approval.metadata)) return false;
  const metadata = approval.metadata as Record<string, unknown>;
  return approval.action === expectedAction &&
    metadata.agent_id === run.agent_id &&
    metadata.task === run.task;
}

export async function claimPendingAgentApproval(db: AdminSupabaseClient, approvalId: string, userId: string, now = Date.now()) {
  return db.from('agent_approvals')
    .update({ status: 'approved', approved_at: new Date(now).toISOString() })
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('created_at', new Date(now - AGENT_APPROVAL_TTL_MS).toISOString())
    .select('id')
    .maybeSingle();
}

export async function expirePendingAgentApproval(db: AdminSupabaseClient, approvalId: string, userId: string, now = Date.now()) {
  return db.from('agent_approvals')
    .update({ status: 'expired' })
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('created_at', new Date(now - AGENT_APPROVAL_TTL_MS).toISOString())
    .select('id')
    .maybeSingle();
}

export async function cancelPendingAgentApproval(db: AdminSupabaseClient, approvalId: string, userId: string, now = Date.now()) {
  return db.from('agent_approvals')
    .update({ status: 'cancelled' })
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('created_at', new Date(now - AGENT_APPROVAL_TTL_MS).toISOString())
    .select('id')
    .maybeSingle();
}
