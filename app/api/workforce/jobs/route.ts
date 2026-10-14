import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const roles = new Map(PROFESSIONAL_ROLES.map(role => [role.id, role]));
const createSchema = z.object({
  role_id: z.string().min(1).max(100),
  task: z.string().trim().min(1).max(12000),
  context: z.string().max(12000).default(''),
  project_id: z.string().uuid().optional().nullable(),
  dependencies: z.array(z.string().uuid()).max(10).default([]),
  idempotency_key: z.string().trim().min(8).max(120).optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.dependencies).size !== value.dependencies.length) ctx.addIssue({ code: 'custom', path: ['dependencies'], message: 'Duplicate dependency IDs are not allowed.' });
  if (new TextEncoder().encode(JSON.stringify(value)).length > 26000) ctx.addIssue({ code: 'custom', path: [], message: 'Task payload is too large.' });
});

export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required.' }, { status: 403 });
  const db = adminSupabase();
  const [jobsResult, projectsResult] = await Promise.all([
    db.from('workforce_role_jobs').select('id,role_id,role_name,project_id,task,dependencies,status,attempts,result,error_code,created_at,updated_at,started_at,completed_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100),
    db.from('projects').select('id,project_name,type,status').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (jobsResult.error || projectsResult.error) return NextResponse.json({ error: 'Workforce task queue or project list is unavailable. Apply the durable workforce migration.' }, { status: 503 });
  return NextResponse.json({ jobs: jobsResult.data || [], projects: projectsResult.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required.' }, { status: 403 });
  if (process.env.WORKFORCE_WORKER_ENABLED !== 'true') return NextResponse.json({ error: 'Durable workforce execution is disabled until the worker is configured.' }, { status: 503 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workforce-role-job-create', 60, 3600);
  if (limited) return limited;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid role task. Check the role, task length and dependency IDs.' }, { status: 400 });
  const role = roles.get(parsed.data.role_id);
  if (!role) return NextResponse.json({ error: 'Unknown professional role.' }, { status: 404 });
  const db = adminSupabase();
  const dependencies = parsed.data.dependencies;
  if (dependencies.length) {
    const { data: parents, error } = await db.from('workforce_role_jobs').select('id,project_id').eq('user_id', ctx.user.id).in('id', dependencies);
    if (error) return NextResponse.json({ error: 'Dependencies could not be verified.' }, { status: 503 });
    if ((parents || []).length !== dependencies.length) return NextResponse.json({ error: 'Every dependency must refer to a task in your private workforce queue.' }, { status: 400 });
    const expectedProjectId = parsed.data.project_id || null;
    if ((parents || []).some(parent => (parent.project_id || null) !== expectedProjectId)) {
      return NextResponse.json({ error: 'A task can depend only on tasks in the same project scope. Global tasks may depend only on other global tasks.' }, { status: 400 });
    }
  }
  const key = parsed.data.idempotency_key || req.headers.get('idempotency-key')?.trim().slice(0, 120) || undefined;
  if (key && key.length < 8) return NextResponse.json({ error: 'Idempotency key must contain at least 8 characters.' }, { status: 400 });
  const projectId = parsed.data.project_id || null;
  if (projectId) {
    const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', projectId).eq('user_id', ctx.user.id).maybeSingle();
    if (projectError) return NextResponse.json({ error: 'Project ownership could not be verified.' }, { status: 503 });
    if (!project) return NextResponse.json({ error: 'Project not found in your account.' }, { status: 404 });
  }
  const payload = {
    user_id: ctx.user.id,
    project_id: projectId,
    role_id: role.id,
    role_name: role.name,
    task: parsed.data.task,
    context: parsed.data.context,
    dependencies,
    ...(key ? { idempotency_key: key } : {}),
  };
  const { data, error } = await db.from('workforce_role_jobs').insert(payload)
    .select('id,role_id,role_name,status,dependencies,attempts,created_at').single();
  if (error && key && (error.code === '23505' || /duplicate key/i.test(error.message))) {
    const { data: existing } = await db.from('workforce_role_jobs').select('id,role_id,role_name,status,dependencies,attempts,created_at').eq('user_id', ctx.user.id).eq('idempotency_key', key).maybeSingle();
    if (existing) return NextResponse.json({ job: existing, idempotent_replay: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  if (error) return NextResponse.json({ error: 'Workforce task could not be queued.' }, { status: 503 });
  return NextResponse.json({ job: data }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
