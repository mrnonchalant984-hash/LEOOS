import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string; id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'cloud-build-retry', 6, 3600);
  if (limited) return limited;
  const { provider, id } = await params;
  if (provider !== 'expo' && provider !== 'godot') return NextResponse.json({ error: 'Unsupported build provider.' }, { status: 400 });
  const providerName = provider === 'expo' ? 'expo-eas' : 'godot-build-service';
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider,provider_job_id,status,profile')
    .eq('id', id).eq('owner_user_id', ctx.user.id).eq('provider', providerName).maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (!['failed', 'cancelled'].includes(job.status)) return NextResponse.json({ error: 'Only failed or cancelled builds can be retried.' }, { status: 409 });
  if (job.provider_job_id) return NextResponse.json({ error: 'This job has a provider job ID. Check provider history before retrying.' }, { status: 409 });
  const profile = String(job.profile);
  const body = provider === 'expo'
    ? { project_id: job.project_id, platform: profile.split(':')[0], profile: profile.split(':')[1] || 'preview', idempotency_key: randomUUID() }
    : { project_id: job.project_id, preset: profile, idempotency_key: randomUUID() };
  const headers = new Headers(req.headers);
  headers.delete('content-length');
  const retryRequest = new NextRequest(new URL(`/api/builds/${provider}`, req.url), { method: 'POST', headers, body: JSON.stringify(body) });
  const response = provider === 'expo'
    ? await (await import('@/app/api/builds/expo/route')).POST(retryRequest)
    : await (await import('@/app/api/builds/godot/route')).POST(retryRequest);
  const result = await response.json().catch(() => null);
  return NextResponse.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
}
