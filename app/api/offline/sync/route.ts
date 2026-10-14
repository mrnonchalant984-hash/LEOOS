import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const eventSchema = z.object({ idempotency_key: z.string().trim().min(8).max(120), kind: z.enum(['draft', 'workforce_task']), payload: z.record(z.string(), z.unknown()) }).strict();
const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(50) }).strict();
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in before synchronizing offline work.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'offline-sync', 30, 3600); if (limited) return limited;
  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid sync batch. Submit 1–50 bounded events.' }, { status: 400 });
  if (new Set(parsed.data.events.map(e => e.idempotency_key)).size !== parsed.data.events.length) return NextResponse.json({ error: 'Duplicate idempotency keys in one batch are not allowed.' }, { status: 400 });
  const db = adminSupabase(); const results: Array<Record<string, unknown>> = [];
  for (const event of parsed.data.events) {
    if (new TextEncoder().encode(JSON.stringify(event.payload)).length > 16_000) { results.push({ idempotency_key: event.idempotency_key, status: 'rejected', error: 'payload_too_large' }); continue; }
    const { data: existing } = await db.from('offline_sync_events').select('status,result').eq('user_id', auth.user.id).eq('idempotency_key', event.idempotency_key).maybeSingle();
    if (existing) { results.push({ idempotency_key: event.idempotency_key, status: existing.status, result: existing.result, duplicate: true }); continue; }
    let status: 'accepted' | 'queued' | 'rejected' = 'accepted'; let result: Record<string, unknown> = { synced: true };
    if (event.kind === 'workforce_task') {
      if (!isPlatformOwner(auth.profile)) { status = 'rejected'; result = { error: 'owner_workforce_only' }; }
      else {
        const roleId = typeof event.payload.role_id === 'string' ? event.payload.role_id : '';
        const task = typeof event.payload.task === 'string' ? event.payload.task.trim() : '';
        const context = typeof event.payload.context === 'string' ? event.payload.context.slice(0, 12000) : '';
        const projectId = typeof event.payload.project_id === 'string' ? event.payload.project_id : null;
        const role = PROFESSIONAL_ROLES.find(r => r.id === roleId);
        if (!role || !task || task.length > 12000) { status = 'rejected'; result = { error: 'invalid_workforce_task' }; }
        else {
          let projectOk = true;
          if (projectId) { const { data: project, error } = await db.from('projects').select('id').eq('id', projectId).eq('user_id', auth.user.id).maybeSingle(); projectOk = !error && Boolean(project); }
          if (!projectOk) { status = 'rejected'; result = { error: 'project_not_owned' }; }
          else {
            const { data: job, error } = await db.from('workforce_role_jobs').insert({ user_id: auth.user.id, project_id: projectId, role_id: role.id, role_name: role.name, task, context, dependencies: [], idempotency_key: `offline:${event.idempotency_key}` }).select('id,status').single();
            if (error?.code === '23505') {
              const { data: prior } = await db.from('workforce_role_jobs').select('id,status').eq('user_id', auth.user.id).eq('idempotency_key', `offline:${event.idempotency_key}`).maybeSingle();
              if (prior) { status = 'queued'; result = { job_id: prior.id, job_status: prior.status, duplicate: true }; }
              else { status = 'rejected'; result = { error: 'task_enqueue_failed' }; }
            } else if (error || !job) { status = 'rejected'; result = { error: 'task_enqueue_failed' }; }
            else { status = 'queued'; result = { job_id: job.id, job_status: job.status }; }
          }
        }
      }
    } else {
      const draft = typeof event.payload.text === 'string' ? event.payload.text.slice(0, 12000) : '';
      if (!draft) { status = 'rejected'; result = { error: 'empty_draft' }; }
      else result = { synced: true, draft_text: draft, note: 'Draft synced as an outbox event; it was not automatically submitted to Leo.' };
    }
    const { error: saveError } = await db.from('offline_sync_events').insert({ user_id: auth.user.id, idempotency_key: event.idempotency_key, event_kind: event.kind, payload: event.payload, status, result });
    if (saveError && saveError.code !== '23505') { results.push({ idempotency_key: event.idempotency_key, status: 'rejected', error: 'sync_record_failed' }); continue; }
    results.push({ idempotency_key: event.idempotency_key, status, result });
  }
  return NextResponse.json({ results, accepted: results.filter(x => x.status === 'accepted' || x.status === 'queued').length, rejected: results.filter(x => x.status === 'rejected').length }, { headers: { 'Cache-Control': 'no-store' } });
}
