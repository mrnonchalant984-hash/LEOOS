import { recordBramWorkerEvent } from '@/lib/bram/execution-events';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';

export const runtime = 'nodejs';
export const maxDuration = 30;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const config = getCloudflarePreviewConfig();
  if (!config.enabled || !config.projectName) {
    return NextResponse.json({ error: 'Cloudflare Workers previews are not configured.' }, { status: 503 });
  }

  const workerId = `gha-${randomUUID()}`;
  const { data: jobs, error } = await adminSupabase().rpc('claim_cloudflare_preview_jobs', {
    p_worker: workerId,
    p_limit: 1,
    p_lease_seconds: 600,
  });
  if (error) {
    console.error('Cloudflare preview queue claim failed:', error.code || 'unknown');
    return NextResponse.json({ error: 'Cloudflare preview queue is unavailable. Apply the preview migration.' }, { status: 503 });
  }
  const job = Array.isArray(jobs) ? jobs[0] : null;
  if (!job) return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });

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
