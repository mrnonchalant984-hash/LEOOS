import { recordBramWorkerEvent } from '@/lib/bram/execution-events';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';
import { getCloudflarePreviewWorkerName, isVerifiedCloudflareWorkerPreviewUrl } from '@/lib/cloudflare-preview/static-assets';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_PATTERN = /^gha-[0-9a-f-]{36}$/i;
const ERROR_CODES = new Set(['preview_build_failed', 'preview_deploy_failed', 'preview_not_ready', 'preview_worker_timeout', 'preview_worker_configuration_failed', 'preview_worker_lease_expired']);

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const config = getCloudflarePreviewConfig();
  if (!config.enabled || !config.projectName) {
    return NextResponse.json({ error: 'Cloudflare previews are not configured.' }, { status: 503 });
  }
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: 'Preview result exceeds the request size limit.' }, { status: 413 });
  }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Send a valid preview result.' }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : '';
  const workerId = typeof value.workerId === 'string' ? value.workerId : '';
  const status = value.status;
  if (!UUID_PATTERN.test(id) || !WORKER_PATTERN.test(workerId) || (status !== 'deployed' && status !== 'failed')) {
    return NextResponse.json({ error: 'Preview result fields are invalid.' }, { status: 400 });
  }

  const db = adminSupabase();
  const { data: job, error: jobError } = await db.from('cloudflare_preview_jobs')
    .select('id,branch_name,project_id,attempts,user_id')
    .eq('id', id)
    .eq('lease_owner', workerId)
    .eq('status', 'running')
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: 'Preview result could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Preview lease is no longer active.' }, { status: 409 });

  let deploymentUrl: string | null = null;
  let errorCode: string | null = null;
  if (status === 'deployed') {
    const expectedWorkerName = getCloudflarePreviewWorkerName(config.projectName, job.project_id);
    if (!isVerifiedCloudflareWorkerPreviewUrl(value.url, expectedWorkerName)) {
      return NextResponse.json({ error: 'The preview deployment URL did not match the assigned Cloudflare Worker.' }, { status: 400 });
    }
    deploymentUrl = value.url;
  } else {
    if (typeof value.errorCode !== 'string' || !ERROR_CODES.has(value.errorCode)) {
      return NextResponse.json({ error: 'The preview failure code is invalid.' }, { status: 400 });
    }
    errorCode = value.errorCode;
  }

  const shouldRetry = status === 'failed' && (job.attempts || 0) < 3;
  const nextStatus = shouldRetry ? 'queued' : status;
  const retryAt = shouldRetry
    ? new Date(Date.now() + Math.min(5, Math.max(1, job.attempts || 1)) * 60_000).toISOString()
    : new Date().toISOString();
  const updatePayload = {
    status: nextStatus,
    deployment_url: deploymentUrl,
    error_code: errorCode,
    ...(nextStatus === 'deployed' || nextStatus === 'failed' ? { static_files: {} } : {}),
    next_attempt_at: retryAt,
    completed_at: nextStatus === 'queued' ? null : new Date().toISOString(),
    lease_owner: null,
    lease_expires_at: null,
  };
  const { data: updated, error: updateError } = await db.from('cloudflare_preview_jobs')
    .update(updatePayload)
    .eq('id', id)
    .eq('lease_owner', workerId)
    .eq('status', 'running')
    .select('id,status,deployment_url,error_code,attempts')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'Preview result could not be saved.' }, { status: 503 });
  if (!updated) return NextResponse.json({ error: 'Preview lease is no longer active.' }, { status: 409 });

  const { data: jobOwner } = await db.from('cloudflare_preview_jobs').select('user_id,project_id').eq('id', id).maybeSingle();
  if (jobOwner) {
    const errorMessage = typeof value.errorMessage === 'string' ? value.errorMessage.slice(0, 1000) : '';
    await recordBramWorkerEvent({
      userId: jobOwner.user_id, projectId: jobOwner.project_id, jobId: id, workerId,
      workerType: 'cloudflare_preview',
      eventType: nextStatus === 'deployed' ? 'completed' : nextStatus === 'queued' ? 'progress' : 'failed',
      status: nextStatus === 'deployed' ? 'succeeded' : nextStatus === 'queued' ? 'queued' : 'failed',
      message: nextStatus === 'deployed'
        ? 'Preview deployment was verified and published.'
        : nextStatus === 'queued'
          ? 'Preview attempt failed; a bounded retry has been scheduled.'
          : 'Preview worker exhausted its retry attempts.',
      metadata: { error_code: errorCode, deployment_url: deploymentUrl, error_message: errorMessage, attempt: job.attempts || 1, retry_scheduled: shouldRetry },
    }).catch(() => console.error('Bram worker completion event could not be persisted.'));
  }

  await db.from('cloudflare_preview_worker_heartbeats').upsert({
    worker_id: workerId,
    status: nextStatus === 'failed' ? 'failed' : 'idle',
    job_id: null,
    last_seen_at: new Date().toISOString(),
    error_code: errorCode,
    metadata: { last_job_id: id, last_job_status: nextStatus },
  }, { onConflict: 'worker_id' }).then(({ error }) => {
    if (error) console.error('Cloudflare preview worker completion heartbeat could not be persisted.');
  });
  return NextResponse.json({ preview: updated }, { headers: { 'Cache-Control': 'no-store' } });
}
