import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { workflowDependencyError, type WorkflowDependencyStep } from '@/lib/workflow-dependencies';
import { nextWorkflowRunAt, type WorkflowSchedule } from '@/lib/workflow-schedule';

export const runtime = 'nodejs';
const stepSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  type: z.literal('agent'),
  name: z.string().trim().min(1).max(100),
  config: z.object({ task: z.string().trim().min(1).max(4000) }).strict(),
  dependsOn: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).max(5).default([]),
}).strict();
const workflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  steps: z.array(stepSchema).max(5).default([]),
  trigger: z.enum(['manual', 'interval', 'daily', 'weekly']).default('manual'),
  everyMinutes: z.number().int().min(15).max(1440).default(60),
  scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  timezone: z.string().min(1).max(80).default('UTC'),
  weekday: z.number().int().min(0).max(6).default(1),
}).strict().superRefine((value, ctx) => {
  const dependencyError = workflowDependencyError(value.steps as WorkflowDependencyStep[]);
  if (dependencyError) ctx.addIssue({ code: 'custom', path: ['steps'], message: dependencyError });
  if (value.trigger === 'interval' && value.steps.length < 1) ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Scheduled workflows need at least one step.' });
  if (value.trigger === 'daily' || value.trigger === 'weekly') {
    try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(new Date()); }
    catch { ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Use a valid IANA timezone.' }); }
    if (value.steps.length < 1) ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Scheduled workflows need at least one step.' });
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value.steps)).length;
  if (bytes > 24_000) ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Workflow definition is too large.' });
});

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('workflows')
    .select('id,name,description,status,trigger_config,definition,next_run_at,created_at,updated_at')
    .eq('user_id', ctx.user.id).order('updated_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Your workflows could not be loaded. Please try again later.' }, { status: 503 });
  const workflows = data ?? [];
  const { data: runs, error: runsError } = await adminSupabase().from('workflow_runs').select('id,workflow_id,status,created_at,completed_at,error_code').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100);
  if (runsError) return NextResponse.json({ error: 'Your workflow history could not be loaded. Please try again later.' }, { status: 503 });
  const recentRuns = runs ?? [];
  return NextResponse.json({ workflows: workflows.map((workflow) => ({ ...workflow, recent_runs: recentRuns.filter((run) => run.workflow_id === workflow.id).slice(0, 3) })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workflow-create', 10, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workflow. Use a name, a short description, up to 5 allowlisted steps, and valid acyclic dependencies.' }, { status: 400 });
  const isScheduled = parsed.data.trigger !== 'manual';
  if (isScheduled && process.env.WORKFLOW_WORKER_ENABLED !== 'true') return NextResponse.json({ error: 'Scheduled workflows are temporarily unavailable. Please try again later.' }, { status: 503 });
  const { data, error } = await adminSupabase().from('workflows').insert({
    user_id: ctx.user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    status: isScheduled ? 'active' : 'draft',
    trigger_config: parsed.data.trigger === 'interval'
      ? { type: 'interval', every_minutes: parsed.data.everyMinutes }
      : parsed.data.trigger === 'daily' || parsed.data.trigger === 'weekly'
        ? { type: parsed.data.trigger, time: parsed.data.scheduleTime, timezone: parsed.data.timezone, ...(parsed.data.trigger === 'weekly' ? { weekday: parsed.data.weekday } : {}) }
        : { type: 'manual' },
    next_run_at: isScheduled
      ? nextWorkflowRunAt(
          parsed.data.trigger === 'interval'
            ? { type: 'interval', every_minutes: parsed.data.everyMinutes }
            : { type: parsed.data.trigger, time: parsed.data.scheduleTime, timezone: parsed.data.timezone, ...(parsed.data.trigger === 'weekly' ? { weekday: parsed.data.weekday } : {}) } as WorkflowSchedule,
        )
      : null,
    definition: { version: 1, steps: parsed.data.steps },
  }).select('id,name,description,status,trigger_config,definition,next_run_at,created_at,updated_at').single();
  if (error) return NextResponse.json({ error: 'Your workflow could not be saved. Please try again later.' }, { status: 503 });
  return NextResponse.json({ workflow: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
