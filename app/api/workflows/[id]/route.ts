import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

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
  if (parsed.data.status === 'active' && (current.trigger_config as { type?: string })?.type !== 'interval') return NextResponse.json({ error: 'Only interval-triggered workflows can be activated. Manual workflows remain drafts and can be run on demand.' }, { status: 400 });
  const interval = Number((current.trigger_config as { every_minutes?: unknown })?.every_minutes);
  const safeInterval = Number.isInteger(interval) && interval >= 15 && interval <= 1440 ? interval : 60;
  const { data, error } = await db.from('workflows').update({ status: parsed.data.status, next_run_at: parsed.data.status === 'active' ? new Date(Date.now() + safeInterval * 60_000).toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', ctx.user.id).select('id,status,next_run_at').single();
  if (error) return NextResponse.json({ error: 'Workflow status could not be updated.' }, { status: 503 });
  return NextResponse.json({ workflow: data });
}
