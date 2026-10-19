import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { createCalculatorAndroidProject } from '@/lib/android-build';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const actor = await getBuildActor(request, 'mcp:write');
  if (!actor) return reply(401, { error: 'Login required.' });
  const body = await request.json().catch(() => null);
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return reply(400, { error: 'A UUID idempotency_key is required. Reuse it when retrying this request.' });

  const db = adminSupabase();
  const { data: prior, error: priorError } = await db.from('android_build_jobs').select('id,project_id,status,progress,attempts,size_bytes,sha256,error')
    .eq('owner_user_id', actor.user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (priorError) return reply(503, { error: 'Android build job storage is unavailable. Apply the Android artifact migration.' });
  if (prior) {
    if (prior.status === 'completed') return reply(200, { ...prior, download_url: `/api/builds/android/${prior.id}/artifact`, deduplicated: true });
    if (prior.status === 'building' || prior.status === 'queued') return reply(202, { ...prior, status_url: `/api/builds/android/${prior.id}`, deduplicated: true });
    return reply(409, { ...prior, retry: 'Start a new request with a new idempotency_key after reviewing this failed job.' });
  }

  const limited = await enforceUserRateLimit(actor.user.id, 'android-local-build', 1, 3600);
  if (limited) return limited;
  const owner = isPlatformOwner(actor.profile);
  const plan = await getEffectiveUserPlan(actor.user.id, owner);
  if (!planAllowsCloudProject(plan, 'mobile_app', owner)) {
    return reply(403, { error: 'Android builds are not enabled for this account. The platform owner must configure an eligible mobile-app plan.' });
  }

  const started = await db.rpc('start_android_build_job', {
    p_owner_user_id: actor.user.id,
    p_idempotency_key: idempotencyKey,
    p_project_limit: plan.limits.maxProjects,
    p_monthly_limit: plan.limits.monthlyBuilds,
  });
  if (started.error) {
    const message = started.error.message || '';
    if (message.includes('Project limit reached')) return reply(403, { error: 'Project limit reached for the current plan.' });
    if (message.includes('Monthly build limit reached')) return reply(429, { error: 'Monthly build limit reached. Retry after the monthly allowance resets.' });
    return reply(503, { error: 'Android build job could not be admitted. Verify the Android artifact migration is applied.' });
  }
  const jobId = String(started.data?.[0]?.job_id || '');
  const created = started.data?.[0]?.created === true;
  if (!jobId) return reply(503, { error: 'Android build job could not be persisted.' });
  if (!created) {
    const { data: raced } = await db.from('android_build_jobs').select('id,project_id,status,progress,attempts,size_bytes,sha256,error')
      .eq('id', jobId).eq('owner_user_id', actor.user.id).maybeSingle();
    if (!raced) return reply(503, { error: 'Existing Android build job could not be loaded.' });
    if (raced.status === 'completed') return reply(200, { ...raced, download_url: `/api/builds/android/${raced.id}/artifact`, deduplicated: true });
    if (raced.status === 'queued' || raced.status === 'building') return reply(202, { ...raced, status_url: `/api/builds/android/${raced.id}`, deduplicated: true });
    return reply(409, { ...raced, retry: 'Start a new request with a new idempotency_key after reviewing this failed job.' });
  }
  const job = { id: jobId };

  const files = createCalculatorAndroidProject();
  const { data: project, error: projectError } = await db.from('projects').insert({
    user_id: actor.user.id,
    project_name: 'LeonardX Calculator',
    type: 'mobile_app',
    status: 'building',
    progress: 5,
    files,
  }).select('id').single();
  if (projectError || !project) {
    await db.from('android_build_jobs').update({ status: 'failed', error: 'Calculator project could not be created.', updated_at: new Date().toISOString() }).eq('id', job.id);
    return reply(503, { job_id: job.id, status: 'failed', error: 'Calculator project could not be created.' });
  }
  const { error: attachError } = await db.from('android_build_jobs').update({ project_id: project.id, updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('owner_user_id', actor.user.id).eq('status', 'queued');
  if (attachError) {
    await db.from('android_build_jobs').update({ status: 'failed', error: 'Calculator project was created but could not be attached to its build job.' })
      .eq('id', job.id).eq('owner_user_id', actor.user.id);
    return reply(503, { job_id: job.id, project_id: project.id, status: 'failed', error: 'Build job could not be queued. The project is preserved.' });
  }
  return reply(202, {
    job_id: job.id,
    project_id: project.id,
    status: 'queued',
    progress: 0,
    status_url: `/api/builds/android/${job.id}`,
    message: 'Build queued. A configured Android worker will claim this job and run Gradle asynchronously.',
  });
}
