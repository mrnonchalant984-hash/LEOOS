import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'godot-cloud-build-artifact', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const { data: job, error } = await adminSupabase().from('cloud_build_jobs')
    .select('id,provider_job_id,status').eq('id', id).eq('owner_user_id', ctx.user.id)
    .eq('provider', 'godot-build-service').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (job.status !== 'completed' || !job.provider_job_id) return NextResponse.json({ error: 'Build artifact is not available.' }, { status: 409 });
  let base: string;
  try {
    const url = new URL(process.env.GODOT_BUILD_SERVICE_URL || '');
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error();
    if (url.username || url.password || url.search || url.hash) throw new Error();
    base = url.toString().replace(/\/$/, '');
  } catch { return NextResponse.json({ error: 'Godot build service is not configured.' }, { status: 503 }); }
  const token = process.env.GODOT_BUILD_SERVICE_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: 'Godot build service is not configured.' }, { status: 503 });
  let response: Response;
  try {
    response = await fetch(`${base}/v1/jobs/${encodeURIComponent(job.provider_job_id)}/artifact`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000), cache: 'no-store',
    });
  } catch { return NextResponse.json({ error: 'Build artifact service is temporarily unavailable.' }, { status: 502 }); }
  if (!response.ok || !response.body) return NextResponse.json({ error: 'Build artifact is unavailable.' }, { status: response.status === 404 ? 404 : 502 });
  return new Response(response.body, { status: 200, headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': response.headers.get('content-disposition') || `attachment; filename="godot-build-${id}"`,
    ...(response.headers.get('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
