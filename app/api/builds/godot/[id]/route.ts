import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function service() {
  try {
    const url = new URL(process.env.GODOT_BUILD_SERVICE_URL || '');
    const token = process.env.GODOT_BUILD_SERVICE_TOKEN?.trim();
    if (!token || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return null;
    return { base: url.toString().replace(/\/$/, ''), token };
  } catch { return null; }
}

function localStatus(status: string) {
  if (status === 'validating' || status === 'building' || status === 'packaging') return 'building';
  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'queued') return status;
  return 'failed';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-cloud-build-status', 30, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,status,profile,error,created_at,updated_at')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'godot-build-service').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build status could not be loaded.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (!job.provider_job_id) return NextResponse.json({ ...job, logs: '' }, { headers: { 'Cache-Control': 'no-store' } });
  const config = service();
  if (!config) return NextResponse.json({ error: 'Godot build service is not configured.' }, { status: 503 });
  let remote: Response;
  try {
    remote = await fetch(`${config.base}/v1/jobs/${encodeURIComponent(job.provider_job_id)}`, {
      headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
  } catch { return NextResponse.json({ error: 'Godot build service is temporarily unavailable.', job }, { status: 502 }); }
  if (!remote.ok) return NextResponse.json({ error: 'Godot build status could not be loaded.', job }, { status: 502 });
  const data = await remote.json().catch(() => null);
  if (typeof data?.status !== 'string') return NextResponse.json({ error: 'Godot service returned an invalid job status.' }, { status: 502 });
  const status = localStatus(data.status);
  const update = {
    status,
    error: typeof data.error === 'string' ? data.error.slice(0, 500) : null,
    updated_at: new Date().toISOString(),
    completed_at: ['completed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : null,
  };
  const { error: updateError } = await db.from('cloud_build_jobs').update(update).eq('id', id).eq('owner_user_id', ctx.user.id);
  if (updateError) return NextResponse.json({ error: 'Build status was read but could not be persisted.' }, { status: 503 });
  let logs = '';
  if (req.nextUrl.searchParams.get('include_logs') === 'true') {
    try {
      const logResponse = await fetch(`${config.base}/v1/jobs/${encodeURIComponent(job.provider_job_id)}/logs`, {
        headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(5000), cache: 'no-store',
      });
      const logBody = logResponse.ok ? await logResponse.json().catch(() => null) : null;
      if (typeof logBody?.logs === 'string') logs = logBody.logs;
    } catch { /* Status remains useful without logs. */ }
  }
  return NextResponse.json({ ...job, ...update, logs, artifact_available: status === 'completed' && data.artifactAvailable === true,
    artifact_url: status === 'completed' && data.artifactAvailable === true ? `/api/builds/godot/${id}/artifact` : null },
  { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-cloud-build-cancel', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs').select('id,provider_job_id,status')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'godot-build-service').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (job.status !== 'queued' || !job.provider_job_id) return NextResponse.json({ error: 'Only queued Godot jobs can be cancelled.' }, { status: 409 });
  const config = service();
  if (!config) return NextResponse.json({ error: 'Godot build service is not configured.' }, { status: 503 });
  let response: Response;
  try {
    response = await fetch(`${config.base}/v1/jobs/${encodeURIComponent(job.provider_job_id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
  } catch { return NextResponse.json({ error: 'Godot build service is temporarily unavailable.' }, { status: 502 }); }
  if (!response.ok) return NextResponse.json({ error: 'The worker could not cancel this job; it may already be running.' }, { status: 409 });
  const { error: updateError } = await db.from('cloud_build_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('status', 'queued');
  if (updateError) return NextResponse.json({ error: 'The worker cancelled the job, but its status could not be synchronized.' }, { status: 503 });
  return NextResponse.json({ job_id: id, status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
}
