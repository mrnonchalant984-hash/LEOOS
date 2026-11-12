import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['pause', 'resume', 'cancel', 'retry']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to manage this run.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'agent-run-lifecycle', 20, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Run was not found.' }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (typeof body?.action !== 'string' || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'Choose pause, resume, cancel, or retry.' }, { status: 400 });
  }
  const { data, error } = await adminSupabase().rpc('control_agent_job', {
    p_run_id: id,
    p_user_id: ctx.user.id,
    p_action: body.action,
  });
  if (error) {
    if (error.message.includes('agent job not found')) return NextResponse.json({ error: 'Durable run was not found.' }, { status: 404 });
    return NextResponse.json({ error: 'This run cannot perform that action in its current state.' }, { status: 409 });
  }
  return NextResponse.json({ run_id: id, action: body.action, ...data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
