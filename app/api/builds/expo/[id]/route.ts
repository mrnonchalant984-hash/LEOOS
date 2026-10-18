import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { parseEasJson, runEasCommand } from '@/lib/builders/expo-eas';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  return value && typeof value === 'object' ? [value as Record<string, unknown>] : [];
}

function projectFiles(value: unknown): Record<string, string> | null {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(item => typeof item === 'string')
    ? value as Record<string, string> : null;
}

function buildData(value: unknown) {
  const root = objects(value)[0] || {};
  const build = objects(root.build)[0] || root;
  const raw = String(build.status || build.buildStatus || '').toUpperCase();
  const status = ['FINISHED', 'COMPLETED'].includes(raw) ? 'completed'
    : ['ERRORED', 'FAILED'].includes(raw) ? 'failed'
      : ['CANCELED', 'CANCELLED'].includes(raw) ? 'cancelled'
        : ['IN_PROGRESS', 'BUILDING', 'NEW', 'QUEUED'].includes(raw) ? 'building' : null;
  const artifacts = objects(build.artifacts)[0] || {};
  const artifact = [artifacts.buildUrl, artifacts.applicationArchiveUrl, build.artifactUrl]
    .find(item => typeof item === 'string' && item.startsWith('https://')) as string | undefined;
  const logs = [build.logsUrl, build.buildDetailsUrl].find(item => typeof item === 'string' && item.startsWith('https://')) as string | undefined;
  return { build, status, artifact, logs };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build-status', 30, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,status,profile,error,created_at,updated_at')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build status could not be loaded.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (!job.provider_job_id) return NextResponse.json({ ...job, artifact_available: false }, { headers: { 'Cache-Control': 'no-store' } });
  const projectResult = await db.from('projects').select('files').eq('id', job.project_id).eq('user_id', ctx.user.id).maybeSingle();
  const files = projectFiles(projectResult.data?.files);
  if (projectResult.error || !files) return NextResponse.json({ error: 'Owned Expo project files could not be loaded.' }, { status: 503 });
  let result;
  try {
    result = await runEasCommand(files, ['build:view', job.provider_job_id, '--json', '--non-interactive'], 30_000);
  } catch { return NextResponse.json({ error: 'Expo build status is temporarily unavailable.', job }, { status: 502 }); }
  if (result.code !== 0) return NextResponse.json({ error: 'Expo could not load this build status.', job }, { status: 502 });
  const state = buildData(parseEasJson(result.stdout));
  if (!state.status) return NextResponse.json({ error: 'Expo returned an unknown build status.', job }, { status: 502 });
  const now = new Date().toISOString();
  const { error: updateError } = await db.from('cloud_build_jobs').update({
    status: state.status,
    error: state.status === 'failed' ? 'Expo reported that this build failed.' : null,
    updated_at: now,
    completed_at: ['completed', 'failed', 'cancelled'].includes(state.status) ? now : null,
  }).eq('id', id).eq('owner_user_id', ctx.user.id);
  if (updateError) return NextResponse.json({ error: 'Build status was read but could not be persisted.' }, { status: 503 });
  return NextResponse.json({ ...job, status: state.status,
    artifact_available: state.status === 'completed' && Boolean(state.artifact),
    artifact_url: state.status === 'completed' && state.artifact ? `/api/builds/expo/${id}/artifact` : null,
    logs_url: state.logs || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
