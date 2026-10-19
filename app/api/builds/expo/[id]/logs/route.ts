import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { expoMetadataFiles, parseEasJson, runEasCommand } from '@/lib/builders/expo-eas';
import { downloadExpoBuildLogs } from '@/lib/builders/expo-artifact';
import { withExpoProjectId } from '@/lib/builders/expo-provisioning';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function buildObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value.find(item => item && typeof item === 'object') as Record<string, unknown> || null;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getBuildActor(request, 'mcp:read');
  if (!actor) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(actor.user.id, 'expo-cloud-build-logs', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,status,provider_project_id')
    .eq('id', id).eq('owner_user_id', actor.user.id).eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (!job.provider_job_id) return NextResponse.json({ error: 'Expo has not returned a build ID for this job yet.' }, { status: 409 });
  if (!job.provider_project_id) return NextResponse.json({ error: 'This legacy build has no persisted EAS project mapping.' }, { status: 409 });
  const { data: project, error: projectError } = await db.from('projects').select('files')
    .eq('id', job.project_id).eq('user_id', actor.user.id).maybeSingle();
  if (projectError || !project?.files || typeof project.files !== 'object' || Array.isArray(project.files)) {
    return NextResponse.json({ error: 'Owned Expo project files could not be loaded.' }, { status: 503 });
  }
  let result;
  try { result = await runEasCommand(expoMetadataFiles(withExpoProjectId(project.files as Record<string, string>, job.provider_project_id)), ['build:view', job.provider_job_id, '--json', '--non-interactive'], 30_000); }
  catch { return NextResponse.json({ error: 'Expo build logs are temporarily unavailable.' }, { status: 502 }); }
  if (result.code !== 0) return NextResponse.json({ error: 'Expo could not load this build record.' }, { status: 502 });
  const root = buildObject(parseEasJson(result.stdout));
  const build = buildObject(root?.build) || root;
  if (!build || build.id !== job.provider_job_id) return NextResponse.json({ error: 'Expo returned a build record that does not match this LeonardX job.' }, { status: 502 });
  const logUrls = Array.isArray(build.logFileUrls)
    ? build.logFileUrls.filter(value => typeof value === 'string').slice(0, 4) as string[]
    : [];
  if (!logUrls.length) return NextResponse.json({ error: 'Expo has not published build logs for this job yet.' }, { status: 409 });
  try {
    const logs = (await Promise.all(logUrls.map(url => downloadExpoBuildLogs(url))))
      .join('\n\n')
      .slice(0, 1_000_000);
    return NextResponse.json({ job_id: job.id, build_id: job.provider_job_id, status: job.status, logs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Expo build logs could not be retrieved.' }, { status: 502 });
  }
}