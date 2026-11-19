import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { nextWorkflowRunAt, type WorkflowSchedule } from '@/lib/workflow-schedule';

export const runtime = 'nodejs';
const updateSchema = z.object({ status: z.enum(['active','paused','archived','draft']) }).strict();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workflow-update', 30, 3600);
  if (limited) return limited;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workflow status.' }, { status: 400 });
  const { id } = await params;
  const db = adminSupabase();
  const { data: current, error: lookupError } = await db.from('workflows').select('id,trigger_config').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Workflow storage is unavailable.' }, { status: 503 });
  if (!current) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  const trigger = current.trigger_config as Record<string, unknown>;
  const type = trigger?.type;
  if (parsed.data.status === 'active' && !['interval','daily','weekly'].includes(String(type))) {
    return NextResponse.json({ error: 'Only interval, daily, or weekly workflows can be activated. Manual workflows remain drafts.' }, { status: 400 });
  }
  if (parsed.data.status === 'active' && process.env.WORKFLOW_WORKER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Scheduled workflow execution is not enabled on this deployment.' }, { status: 503 });
  }
  let nextRunAt: string | null = null;
  if (parsed.data.status === 'active') {
    try {
      const schedule: WorkflowSchedule = type === 'interval'
        ? { type: 'interval', every_minutes: Number(trigger.every_minutes) }
        : type === 'daily'
          ? { type: 'daily', time: String(trigger.time || '09:00'), timezone: String(trigger.timezone || 'UTC') }
          : { type: 'weekly', time: String(trigger.time || '09:00'), timezone: String(trigger.timezone || 'UTC'), weekday: Number(trigger.weekday ?? 1) };
      nextRunAt = nextWorkflowRunAt(schedule);
    } catch {
      return NextResponse.json({ error: 'The workflow schedule configuration is invalid.' }, { status: 400 });
    }
  }
  const { data, error } = await db.from('workflows').update({ status: parsed.data.status, next_run_at: nextRunAt, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', ctx.user.id).select('id,status,next_run_at').single();
  if (error) return NextResponse.json({ error: 'Workflow status could not be updated.' }, { status: 503 });
  return NextResponse.json({ workflow: data });
}
