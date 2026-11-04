import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { POST as buildDeployPost } from '@/app/api/build-deploy/route';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Protected queue poller invoked by the existing GitHub Actions scheduler. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = adminSupabase();
  const workerId = crypto.randomUUID();
  const { data: jobs, error } = await db.rpc('claim_leo_build_jobs', { p_worker: workerId, p_limit: 1, p_lease_seconds: 360 });
  if (error) return NextResponse.json({ error: 'Build queue is unavailable. Apply the durable Leo build migration.' }, { status: 503 });
  let processed = 0;
  const results: Array<{ job_id: string; status: string; code?: string }> = [];
  for (const job of jobs || []) {
    let buildRouteInvoked = false;
    try {
      const request = new NextRequest(new URL('/api/build-deploy', req.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-leonardx-build-worker': secret,
          'x-leonardx-build-job-id': job.id,
          'x-leonardx-build-worker-id': workerId,
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ worker: true }),
      });
      buildRouteInvoked = true;
      const response = await buildDeployPost(request);
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const succeeded = response.ok && body?.success === true && body?.status === 'deployed' && typeof body.liveUrl === 'string' && /^https:\/\//.test(body.liveUrl);
      const { data: build } = await db.from('project_builds')
        .select('id,status').eq('owner_user_id', job.user_id).eq('website_project_id', job.website_project_id)
        .eq('idempotency_key', typeof job.request_payload?.idempotency_key === 'string' ? job.request_payload.idempotency_key : job.idempotency_key).maybeSingle();
      const failureCode = succeeded ? null : (typeof body?.code === 'string' ? body.code : response.status === 200 ? 'deployment_not_verified' : `build_http_${response.status}`);
      const retryableResponse = !succeeded && (body?.retryable === true || response.status === 429 || response.status === 503) && Number(job.attempts || 1) < 3;
      const retryPayload = retryableResponse && job.request_payload && typeof job.request_payload === 'object'
        ? { ...(job.request_payload as Record<string, unknown>), idempotency_key: `${job.id}.retry${Number(job.attempts || 1) + 1}` }
        : job.request_payload;
      const { error: finalizeError } = await db.from('leo_build_jobs').update({
        status: succeeded ? 'succeeded' : retryableResponse ? 'queued' : 'failed',
        ...(retryableResponse ? { request_payload: retryPayload, available_at: new Date(Date.now() + 60_000 * Number(job.attempts || 1)).toISOString() } : {}),
        project_build_id: build?.id || null,
        error_code: retryableResponse ? null : failureCode,
        ...(retryableResponse ? {} : { completed_at: new Date().toISOString() }),
        lease_owner: null, lease_expires_at: null,
      }).eq('id', job.id).eq('lease_owner', workerId).eq('status', 'running');
      if (finalizeError) throw finalizeError;
      if (!succeeded && !retryableResponse) {
        await db.from('deployment_events').insert({ website_project_id: job.website_project_id, event_type: 'build_queue_failed', status: 'error', message: 'Background build did not reach verified deployed state.', metadata: { queue_job_id: job.id, code: failureCode } });
      } else if (succeeded) {
        await db.from('deployment_events').insert({ website_project_id: job.website_project_id, event_type: 'build_queue_completed', status: 'success', message: 'Background build reached verified deployed state.', metadata: { queue_job_id: job.id, build_id: build?.id || null } });
      } else if (retryableResponse) {
        await db.from('deployment_events').insert({ website_project_id: job.website_project_id, event_type: 'build_queue_retry', status: 'queued', message: 'A transient build provider failure occurred; a bounded retry has been scheduled.', metadata: { queue_job_id: job.id, attempt: Number(job.attempts || 1), code: failureCode } });
      }
      processed += 1;
      results.push({ job_id: job.id, status: succeeded ? 'succeeded' : retryableResponse ? 'retry_queued' : 'failed', ...(failureCode ? { code: failureCode } : {}) });
    } catch (error) {
      const retry = !buildRouteInvoked && Number(job.attempts || 1) < 3;
      const code = error instanceof Error && /timeout|timed out/i.test(error.message) ? 'worker_timeout' : 'worker_execution_failed';
      await db.from('leo_build_jobs').update({ status: retry ? 'queued' : 'failed', available_at: new Date(Date.now() + 60_000 * Number(job.attempts || 1)).toISOString(), lease_owner: null, lease_expires_at: null, error_code: retry ? null : code, ...(retry ? {} : { completed_at: new Date().toISOString() }) }).eq('id', job.id).eq('lease_owner', workerId).eq('status', 'running');
      results.push({ job_id: job.id, status: retry ? 'retry_queued' : 'failed', code });
    }
  }
  // Jobs whose final lease expired are terminalized instead of remaining stuck forever.
  await db.from('leo_build_jobs').update({ status: 'failed', error_code: 'worker_attempts_exhausted', completed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null })
    .eq('status', 'running').gte('attempts', 3).not('lease_expires_at', 'is', null).lt('lease_expires_at', new Date().toISOString());
  return NextResponse.json({ claimed: jobs?.length || 0, processed, results }, { headers: { 'Cache-Control': 'no-store' } });
}
