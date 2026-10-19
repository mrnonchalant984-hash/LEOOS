import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getBuildActor(request, 'mcp:read');
  if (!actor) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(actor.user.id, 'android-build-status', 30, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid Android build job ID.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('android_build_jobs')
    .select('id,project_id,status,progress,attempts,size_bytes,sha256,error,created_at,updated_at,completed_at')
    .eq('id', id).eq('owner_user_id', actor.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Android build status is temporarily unavailable.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Android build job not found.' }, { status: 404 });
  return NextResponse.json({ ...data, download_url: data.status === 'completed' ? `/api/builds/android/${id}/artifact` : null }, { headers: { 'Cache-Control': 'no-store' } });
}
