import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const actionSchema = z.object({ action: z.enum(['cancel', 'retry']) }).strict();

/** Owner-only, compare-and-set task transitions. Running tasks cannot be cancelled in-place. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workforce-role-job-transition', 60, 3600);
  if (limited) return limited;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Action must be cancel or retry.' }, { status: 400 });
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error: jobError } = await db.from('workforce_role_jobs')
    .select('id,user_id,project_id,dependencies,status,attempts')
    .eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (jobError) return NextResponse.json({ error: 'Workforce task storage is unavailable.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Workforce task not found.' }, { status: 404 });

  const now = new Date().toISOString();
  if (parsed.data.action === 'cancel') {
    if (job.status !== 'queued') return NextResponse.json({ error: 'Only queued tasks can be cancelled. Running tasks must finish or be recovered by lease expiry.' }, { status: 409 });
    const { data: cancelled, error } = await db.from('workforce_role_jobs').update({ status: 'cancelled', error_code: 'cancelled_by_owner', completed_at: now, updated_at: now })
      .eq('id', id).eq('user_id', ctx.user.id).eq('status', 'queued').select('id,status,updated_at').maybeSingle();
    if (error) return NextResponse.json({ error: 'Task cancellation could not be saved.' }, { status: 503 });
    if (!cancelled) return NextResponse.json({ error: 'Task state changed before cancellation; refresh and try again.' }, { status: 409 });
    return NextResponse.json({ job: cancelled });
  }

  if (!['failed', 'blocked'].includes(job.status)) return NextResponse.json({ error: 'Only failed or blocked tasks can be retried.' }, { status: 409 });
  if (job.attempts >= 3 && job.status === 'failed') {
    // Manual retry explicitly starts a new bounded retry cycle.
  }
  const dependencyIds = Array.isArray(job.dependencies) ? job.dependencies as string[] : [];
  if (dependencyIds.length) {
    const { data: parents, error } = await db.from('workforce_role_jobs')
      .select('id,status,project_id').eq('user_id', ctx.user.id).in('id', dependencyIds);
    if (error) return NextResponse.json({ error: 'Task dependencies could not be verified.' }, { status: 503 });
    if ((parents || []).length !== dependencyIds.length || (parents || []).some(parent => parent.status !== 'succeeded' || (parent.project_id || null) !== (job.project_id || null))) {
      return NextResponse.json({ error: 'Resolve every prerequisite successfully in the same project scope before retrying this task.' }, { status: 409 });
    }
  }
  const { data: retried, error } = await db.from('workforce_role_jobs').update({
    status: 'queued', attempts: 0, available_at: now, lease_owner: null, lease_expires_at: null,
    result: null, error_code: null, started_at: null, completed_at: null, updated_at: now,
  }).eq('id', id).eq('user_id', ctx.user.id).in('status', ['failed', 'blocked']).select('id,status,attempts,updated_at').maybeSingle();
  if (error) return NextResponse.json({ error: 'Task could not be queued for a new bounded retry cycle.' }, { status: 503 });
  if (!retried) return NextResponse.json({ error: 'Task state changed before retry; refresh and try again.' }, { status: 409 });
  return NextResponse.json({ job: retried }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
