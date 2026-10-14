import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { canUseManualAgents } from '@/lib/agents/entitlements';

export const runtime = 'nodejs';
const inputSchema = z.object({ input: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().trim().min(8).max(120).optional() }).strict().superRefine((value, ctx) => { if (new TextEncoder().encode(JSON.stringify(value.input)).length > 8000) ctx.addIssue({ code: 'custom', path: ['input'], message: 'Input too large.' }); });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!canUseManualAgents(plan.key, owner)) return NextResponse.json({ error: 'Upgrade your plan to run workflows.' }, { status: 403 });
  if (process.env.WORKFLOW_WORKER_ENABLED !== 'true') return NextResponse.json({ error: 'Workflow runs are temporarily unavailable. Please try again later.' }, { status: 503 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workflow-run', 20, 3600);
  if (limited) return limited;
  const { id } = await params;
  const parsed = inputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid run input.' }, { status: 400 });
  const db = adminSupabase();
  const { data: workflow, error: workflowError } = await db.from('workflows')
    .select('id,user_id,status,definition').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (workflowError) return NextResponse.json({ error: 'Your workflow could not be started. Please try again later.' }, { status: 503 });
  if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  if (workflow.status === 'archived' || workflow.status === 'paused') return NextResponse.json({ error: 'This workflow is paused or archived.' }, { status: 409 });
  const steps = (workflow.definition as { steps?: unknown[] } | null)?.steps;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 5) return NextResponse.json({ error: 'Add between one and five steps before running this workflow.' }, { status: 409 });
  const { data: run, error } = await db.from('workflow_runs').insert({
    workflow_id: workflow.id, user_id: ctx.user.id, status: 'queued', input: parsed.data.input,
    idempotency_key: parsed.data.idempotencyKey ?? null,
  }).select('id,status,created_at').single();
  if (error) {
    if (parsed.data.idempotencyKey) {
      const { data: existing } = await db.from('workflow_runs').select('id,status,created_at').eq('workflow_id', workflow.id).eq('user_id', ctx.user.id).eq('idempotency_key', parsed.data.idempotencyKey).maybeSingle();
      if (existing) return NextResponse.json({ run: existing, deduplicated: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Your workflow could not be started. Please try again later.' }, { status: 503 });
  }
  return NextResponse.json({ run, queued: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
