import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';
import { isVerifiedCloudflarePreviewUrl } from '@/lib/cloudflare-preview/static-assets';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_PATTERN = /^gha-[0-9a-f-]{36}$/i;
const ERROR_CODES = new Set(['preview_deploy_failed', 'preview_not_ready', 'preview_worker_timeout']);

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
    .select('id,branch_name')
    .eq('id', id)
    .eq('lease_owner', workerId)
    .eq('status', 'running')
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: 'Preview result could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Preview lease is no longer active.' }, { status: 409 });

  let deploymentUrl: string | null = null;
  let errorCode: string | null = null;
  if (status === 'deployed') {
    if (!isVerifiedCloudflarePreviewUrl(value.url, job.branch_name, config.projectName)) {
      return NextResponse.json({ error: 'The preview deployment URL did not match the assigned Cloudflare branch.' }, { status: 400 });
    }
    deploymentUrl = value.url;
  } else {
    if (typeof value.errorCode !== 'string' || !ERROR_CODES.has(value.errorCode)) {
      return NextResponse.json({ error: 'The preview failure code is invalid.' }, { status: 400 });
    }
    errorCode = value.errorCode;
  }

  const { data: updated, error: updateError } = await db.from('cloudflare_preview_jobs')
    .update({
      status,
      deployment_url: deploymentUrl,
      error_code: errorCode,
      static_files: {},
      completed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('id', id)
    .eq('lease_owner', workerId)
    .eq('status', 'running')
    .select('id,status,deployment_url,error_code')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'Preview result could not be saved.' }, { status: 503 });
  if (!updated) return NextResponse.json({ error: 'Preview lease is no longer active.' }, { status: 409 });
  return NextResponse.json({ preview: updated }, { headers: { 'Cache-Control': 'no-store' } });
}
