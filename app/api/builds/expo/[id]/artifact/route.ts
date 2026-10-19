import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { expoMetadataFiles, parseEasJson, runEasCommand } from '@/lib/builders/expo-eas';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function artifactUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  const build = root.build && typeof root.build === 'object' ? root.build as Record<string, unknown> : root;
  const artifacts = build.artifacts && typeof build.artifacts === 'object' ? build.artifacts as Record<string, unknown> : {};
  const candidates = [artifacts.buildUrl, artifacts.applicationArchiveUrl, build.artifactUrl];
  return candidates.find((item) => typeof item === 'string' && item.startsWith('https://')) as string || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build-artifact', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,status').eq('id', id).eq('owner_user_id', ctx.user.id)
    .eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (job.status !== 'completed' || !job.provider_job_id) return NextResponse.json({ error: 'Build artifact is not available.' }, { status: 409 });
  const { data: project, error: projectError } = await db.from('projects').select('files')
    .eq('id', job.project_id).eq('user_id', ctx.user.id).maybeSingle();
  if (projectError || !project?.files) return NextResponse.json({ error: 'Owned Expo project files could not be loaded.' }, { status: 503 });
  let result;
  try { result = await runEasCommand(expoMetadataFiles(project.files), ['build:view', job.provider_job_id, '--json', '--non-interactive'], 30_000); }
  catch { return NextResponse.json({ error: 'Expo artifact status is temporarily unavailable.' }, { status: 502 }); }
  if (result.code !== 0) return NextResponse.json({ error: 'Expo could not verify this build artifact.' }, { status: 502 });
  const url = artifactUrl(parseEasJson(result.stdout));
  if (!url) return NextResponse.json({ error: 'Expo did not return a verified artifact URL.' }, { status: 409 });
  let upstream: Response;
  try { upstream = await fetch(url, { signal: AbortSignal.timeout(60_000), cache: 'no-store' }); }
  catch { return NextResponse.json({ error: 'Expo artifact download is temporarily unavailable.' }, { status: 502 }); }
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'Expo artifact could not be downloaded.' }, { status: 502 });
  return new Response(upstream.body, { status: 200, headers: {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': upstream.headers.get('content-disposition') || `attachment; filename="android-build-${id}.apk"`,
    ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
