import { recordBramWorkerEvent } from '@/lib/bram/execution-events';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';

export const runtime = 'nodejs';
export const maxDuration = 30;
const WORKER_PATTERN = /^gha-[0-9a-f-]{36}$/i;
const JOB_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

async function heartbeat(workerId: string, status: 'idle' | 'running' | 'failed', jobId: string | null, errorCode: string | null = null) {
  const { error } = await adminSupabase().from('cloudflare_preview_worker_heartbeats').upsert({
    worker_id: workerId,
    status,
    job_id: jobId,
    last_seen_at: new Date().toISOString(),
    error_code: errorCode,
    metadata: { source: 'github_actions' },
  }, { onConflict: 'worker_id' });
  if (error) throw new Error('Cloudflare preview worker heartbeat could not be persisted.');
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const config = getCloudflarePreviewConfig();
  if (!config.enabled || !config.projectName) {
    return NextResponse.json({ error: 'Cloudflare Workers previews are not configured.' }, { status: 503 });
  }

  const workerId = `gha-${randomUUID()}`;
  const db = adminSupabase();
  const { data: jobs, error } = await db.rpc('claim_cloudflare_preview_jobs', {
    p_worker: workerId,
    p_limit: 1,
    p_lease_seconds: 1800,
  });
  if (error) {
    console.error('Cloudflare preview queue claim failed:', error.code || 'unknown');
    await heartbeat(workerId, 'failed', null, 'preview_queue_claim_failed').catch(() => undefined);
    return NextResponse.json({ error: 'Cloudflare preview queue is unavailable. Check the applied preview retry migration and service-role database access.' }, { status: 503 });
  }
  const job = Array.isArray(jobs) ? jobs[0] : null;
  if (!job) {
    await heartbeat(workerId, 'idle', null).catch(() => console.error('Cloudflare preview idle heartbeat could not be persisted.'));
    return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  await heartbeat(workerId, 'running', job.id);
  await recordBramWorkerEvent({
    userId: job.user_id, projectId: job.project_id, jobId: job.id, workerId,
    workerType: 'cloudflare_preview', eventType: 'claimed', status: 'running',
    message: 'Preview worker claimed the queued job.', metadata: { attempt: job.attempts || 1 },
  }).catch(() => console.error('Bram worker event could not be persisted for preview claim.'));

  return NextResponse.json({
    job: {
      id: job.id,
      projectId: job.project_id,
      branchName: job.branch_name,
      workerId,
      projectName: config.projectName,
      files: job.static_files,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const config = getCloudflarePreviewConfig();
  if (!config.enabled) return NextResponse.json({ error: 'Cloudflare Workers previews are not configured.' }, { status: 503 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Send a valid worker heartbeat.' }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const workerId = typeof value.workerId === 'string' ? value.workerId : '';
  const id = typeof value.id === 'string' ? value.id : '';
  if (!WORKER_PATTERN.test(workerId) || !JOB_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Worker heartbeat identity is invalid.' }, { status: 400 });
  }

  const db = adminSupabase();
  const { data: job, error } = await db.from('cloudflare_preview_jobs')
    .update({ lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
    .eq('id', id).eq('lease_owner', workerId).eq('status', 'running')
    .select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Worker lease could not be refreshed.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Worker lease is no longer active.' }, { status: 409 });
  await heartbeat(workerId, 'running', id);
  return NextResponse.json({ ok: true, leaseExpiresInSeconds: 1800 }, { headers: { 'Cache-Control': 'no-store' } });
}
