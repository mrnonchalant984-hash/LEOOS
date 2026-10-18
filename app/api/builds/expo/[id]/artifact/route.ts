import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { parseEasJson, runEasCommand } from '@/lib/builders/expo-eas';

export const runtime = 'nodejs';
export const maxDuration = 60;

function findArtifact(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findArtifact(item); if (found) return found; }
    return null;
  }
  const item = value as Record<string, unknown>;
  const artifacts = item.artifacts && typeof item.artifacts === 'object' ? item.artifacts as Record<string, unknown> : {};
  for (const key of ['buildUrl', 'applicationArchiveUrl', 'artifactUrl']) {
    const candidate = artifacts[key] || item[key];
    if (typeof candidate === 'string' && candidate.startsWith('https://')) return candidate;
  }
  return findArtifact(item.build) || findArtifact(item.data);
}

function allowedArtifactUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!(url.hostname === 'expo.dev' || url.hostname.endsWith('.expo.dev') || url.hostname === 'storage.googleapis.com')) return null;
    return url;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build-artifact', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs').select('id,project_id,provider_job_id,status,profile')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (job.status !== 'completed' || !job.provider_job_id) return NextResponse.json({ error: 'Expo artifact is not available.' }, { status: 409 });
  const { data: project, error: projectError } = await db.from('projects').select('files').eq('id', job.project_id).eq('user_id', ctx.user.id).maybeSingle();
  const files = project?.files && typeof project.files === 'object' && !Array.isArray(project.files) ? project.files as Record<string, string> : null;
  if (projectError || !files || !Object.values(files).every(value => typeof value === 'string')) return NextResponse.json({ error: 'Expo source could not be loaded.' }, { status: 503 });
  let statusResult;
  try { statusResult = await runEasCommand(files, ['build:view', job.provider_job_id, '--json', '--non-interactive'], 30_000); }
  catch { return NextResponse.json({ error: 'Expo artifact metadata is temporarily unavailable.' }, { status: 502 }); }
  const signed = statusResult.code === 0 ? findArtifact(parseEasJson(statusResult.stdout)) : null;
  const artifact = signed ? allowedArtifactUrl(signed) : null;
  if (!artifact) return NextResponse.json({ error: 'Expo has not provided a supported downloadable artifact.' }, { status: 404 });
  let upstream: Response;
  try { upstream = await fetch(artifact, { signal: AbortSignal.timeout(30_000), cache: 'no-store', redirect: 'manual' }); }
  catch { return NextResponse.json({ error: 'Expo artifact storage is temporarily unavailable.' }, { status: 502 }); }
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'Expo artifact could not be retrieved.' }, { status: upstream.status === 404 ? 404 : 502 });
  const artifactExtension = path.extname(artifact.pathname).toLowerCase();
  const ext = ['.ipa', '.apk', '.aab'].includes(artifactExtension)
    ? artifactExtension
    : '.bin';
  return new Response(upstream.body, { status: 200, headers: {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="leonardx-${id}${ext}"`,
    ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
