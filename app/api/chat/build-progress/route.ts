import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view build progress.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const db = adminSupabase();
  const requestedSince = Date.parse(req.nextUrl.searchParams.get('since') || '');
  const since = Number.isFinite(requestedSince) ? new Date(Math.max(requestedSince, Date.now() - 24 * 60 * 60 * 1000)).toISOString() : new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: jobs, error } = await db.from('leo_build_jobs')
    .select('id,website_project_id,idempotency_key,request_payload,status,attempts,error_code,project_build_id,created_at,started_at,completed_at')
    .eq('user_id', ctx.user.id).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(5);
  if (error) return NextResponse.json({ error: 'Build progress is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const latest = jobs?.[0];
  if (!latest) return NextResponse.json({ job: null, events: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const [{ data: build }, { data: events }] = await Promise.all([
    db.from('project_builds').select('id,status,step,error,deployment_url,created_at,completed_at')
      .eq('owner_user_id', ctx.user.id).eq('website_project_id', latest.website_project_id)
      .eq('idempotency_key', typeof latest.request_payload?.idempotency_key === 'string' ? latest.request_payload.idempotency_key : latest.idempotency_key).maybeSingle(),
    db.from('deployment_events').select('id,event_type,status,message,metadata,created_at').eq('website_project_id', latest.website_project_id).order('created_at', { ascending: false }).limit(20),
  ]);
  const { request_payload: _privatePayload, ...safeJob } = latest;
  const matchingEvents = (events || []).filter((event: { metadata?: Record<string, unknown> | null }) =>
    event.metadata?.queue_job_id === latest.id || Boolean(build?.id && event.metadata?.build_id === build.id));
  return NextResponse.json({ job: safeJob, build: build || null, events: matchingEvents.slice(0, 8) }, { headers: { 'Cache-Control': 'no-store' } });
}
