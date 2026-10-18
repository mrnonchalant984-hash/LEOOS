import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import {
  cancelEngineeringWorkflow,
  getEngineeringWorkflow,
  listWorkflowEvents,
  serializeWorkflow,
  updateWorkflowStage,
} from '@/lib/engineering-workflow-store';
import { WORKFLOW_STAGE_IDS, WORKFLOW_STATUSES, type WorkflowStageId, type WorkflowStatus } from '@/lib/engineering-workflow';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-workflow-get', 120, 60);
  if (limited) return limited;

  const { data, error } = await getEngineeringWorkflow(auth.user.id, id);
  if (error) return NextResponse.json({ error }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  const events = await listWorkflowEvents(auth.user.id, id, 40);
  return NextResponse.json(
    { workflow: serializeWorkflow(data), events: events.data },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-workflow-patch', 60, 60);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 });
  }

  if (body.action === 'cancel') {
    const { data, error } = await cancelEngineeringWorkflow(auth.user.id, id);
    if (error || !data) return NextResponse.json({ error: error || 'Cancel failed.' }, { status: 400 });
    return NextResponse.json({ workflow: serializeWorkflow(data) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const stageId = body.stageId as WorkflowStageId;
  const status = body.status as WorkflowStatus;
  if (!WORKFLOW_STAGE_IDS.includes(stageId)) {
    return NextResponse.json({ error: 'Unknown workflow stage.' }, { status: 400 });
  }
  if (!WORKFLOW_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unknown workflow status.' }, { status: 400 });
  }

  const { data, error } = await updateWorkflowStage(auth.user.id, id, stageId, status, {
    progressMessage: typeof body.progressMessage === 'string' ? body.progressMessage : null,
    artifacts: body.artifacts && typeof body.artifacts === 'object'
      ? (body.artifacts as Record<string, unknown>)
      : undefined,
    error: body.error && typeof body.error === 'object'
      ? {
        code: String((body.error as { code?: unknown }).code || 'stage_error'),
        message: String((body.error as { message?: unknown }).message || 'Stage failed.'),
      }
      : null,
  });
  if (error || !data) {
    return NextResponse.json({ error: error || 'Stage update failed.' }, { status: 400 });
  }
  return NextResponse.json({ workflow: serializeWorkflow(data) }, { headers: { 'Cache-Control': 'no-store' } });
}
