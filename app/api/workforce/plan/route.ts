import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { buildRoleExecutionPlan } from '@/lib/agents/role-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ objective: z.string().trim().min(3).max(5000), role_ids: z.array(z.string().min(1).max(100)).min(1).max(160), dependencies: z.record(z.string(), z.array(z.string().max(100)).max(20)).optional(), concurrency_limit: z.number().int().min(1).max(8).optional() }).strict();
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req); if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workforce-execution-plan', 20, 3600); if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid execution plan request.' }, { status: 400 });
  try { return NextResponse.json({ plan: buildRoleExecutionPlan(parsed.data.objective, parsed.data.role_ids, parsed.data.dependencies || {}, parsed.data.concurrency_limit), note: 'Plan only: each node still executes through the configured worker queue. Tool permissions remain deny-by-default and no work has been executed by this endpoint.' }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid execution graph.' }, { status: 400 }); }
}
