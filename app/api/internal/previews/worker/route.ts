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
    return NextResponse.json({ error: 'Cloudflare previews are not configured.' }, { status: 503 });
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

  return NextResponse.json({
    job: {
      id: job.id,
      branchName: job.branch_name,
      workerId,
      projectName: config.projectName,
      files: job.static_files,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
