import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel', 'retry']),
  stepId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
}).strict();

type Params = { params: Promise<{ id: string; runId: string }> };
type StepResult = { step_id: string; status: string; output?: string };

function isStepResult(value: unknown): value is StepResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  return typeof step.step_id === 'string' &&
    typeof step.status === 'string' &&
    (step.output === undefined || typeof step.output === 'string');
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(context.user.id, 'workflow-run-approval', 30, 60);
  if (limited) return limited;

  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > 2_048) {
    return NextResponse.json({ error: 'Approval request is too large.' }, { status: 413 });
  }
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Provide a valid workflow approval decision.' }, { status: 400 });

  const { id, runId } = await params;
  const db = adminSupabase();
  const { data: run, error: runError } = await db.from('workflow_runs')
    .select('id,status,output')
    .eq('id', runId)
    .eq('workflow_id', id)
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (runError) return NextResponse.json({ error: 'Workflow run could not be loaded.' }, { status: 503 });
  if (!run) return NextResponse.json({ error: 'Workflow run not found.' }, { status: 404 });
  if (parsed.data.decision === 'cancel') {
    if (!['queued', 'running', 'waiting_approval'].includes(run.status)) {
      return NextResponse.json({ error: 'Only an active workflow run can be cancelled.' }, { status: 409 });
    }
    const { data: cancelled, error } = await db.from('workflow_runs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id)
      .in('status', ['queued', 'running', 'waiting_approval']).select('id').maybeSingle();
    if (error || !cancelled) return NextResponse.json({ error: 'The workflow run could not be cancelled.' }, { status: 503 });
    const { data: cancelledJob, error: jobError } = await db.from('workflow_jobs')
      .update({ status: 'cancelled', lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
      .eq('run_id', runId).in('status', ['queued', 'leased', 'completed']).select('id').maybeSingle();
    if (jobError || !cancelledJob) return NextResponse.json({ error: 'The run was cancelled, but its queue status needs reconciliation.' }, { status: 503 });
    return NextResponse.json({ status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (parsed.data.decision === 'retry') {
    if (run.status !== 'failed') return NextResponse.json({ error: 'Only failed workflow runs can be retried.' }, { status: 409 });
    const { data: queued, error: runQueueError } = await db.from('workflow_runs')
      .update({ status: 'queued', error_code: null, error_message: null, completed_at: null })
      .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id)
      .eq('status', 'failed').select('id').maybeSingle();
    if (runQueueError || !queued) return NextResponse.json({ error: 'The workflow run could not be retried.' }, { status: 503 });
    const { data: retriedJob, error: jobError } = await db.from('workflow_jobs')
      .update({
        status: 'queued',
        attempts: 0,
        available_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('run_id', runId).eq('status', 'dead_letter').select('id').maybeSingle();
    if (jobError || !retriedJob) {
      const { error: restoreError } = await db.from('workflow_runs')
        .update({ status: 'failed' })
        .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id).eq('status', 'queued');
      if (restoreError) console.error('Workflow retry rollback failed:', restoreError.code || 'unknown');
      return NextResponse.json({ error: 'The workflow retry could not be queued.' }, { status: 503 });
    }
    return NextResponse.json({ status: 'queued' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!parsed.data.stepId || run.status !== 'waiting_approval' || !Array.isArray(run.output) || !run.output.every(isStepResult)) {
    return NextResponse.json({ error: 'This workflow run has no valid pending approval checkpoint.' }, { status: 409 });
  }

  const checkpoint = run.output.find(step =>
    step.step_id === parsed.data.stepId && step.status === 'waiting_approval',
  );
  if (!checkpoint) return NextResponse.json({ error: 'That step is not awaiting approval.' }, { status: 409 });

  const output = run.output.map(step => step === checkpoint
    ? { ...step, status: parsed.data.decision === 'approve' ? 'approved' : 'rejected' }
    : step);
  if (parsed.data.decision === 'reject') {
    const { data: cancelled, error } = await db.from('workflow_runs')
      .update({ status: 'cancelled', output, completed_at: new Date().toISOString() })
      .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id)
      .eq('status', 'waiting_approval').select('id').maybeSingle();
    if (error || !cancelled) return NextResponse.json({ error: 'The workflow approval could not be declined.' }, { status: 503 });
    const { data: cancelledJob, error: jobError } = await db.from('workflow_jobs')
      .update({ status: 'cancelled', lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
      .eq('run_id', runId).eq('status', 'completed').select('id').maybeSingle();
    if (jobError || !cancelledJob) return NextResponse.json({ error: 'The run was declined, but its queue status needs reconciliation.' }, { status: 503 });
    return NextResponse.json({ status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: queued, error: queueRunError } = await db.from('workflow_runs')
    .update({ status: 'queued', output, error_code: null, error_message: null, completed_at: null })
    .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id)
    .eq('status', 'waiting_approval').select('id').maybeSingle();
  if (queueRunError || !queued) return NextResponse.json({ error: 'The workflow run could not be resumed.' }, { status: 503 });

  const { data: resumedJob, error: jobError } = await db.from('workflow_jobs')
    .update({
      status: 'queued',
      available_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('run_id', runId).eq('status', 'completed').select('id').maybeSingle();
  if (jobError || !resumedJob) {
    const { error: restoreError } = await db.from('workflow_runs')
      .update({ status: 'waiting_approval', output: run.output })
      .eq('id', runId).eq('workflow_id', id).eq('user_id', context.user.id).eq('status', 'queued');
    if (restoreError) console.error('Workflow approval rollback failed:', restoreError.code || 'unknown');
    return NextResponse.json({ error: 'The workflow queue could not be resumed. The approval was not applied.' }, { status: 503 });
  }

  return NextResponse.json({ status: 'queued' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
