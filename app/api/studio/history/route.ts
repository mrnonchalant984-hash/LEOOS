import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view your studio history.' }, { status: 401 });
  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(40, requestedLimit)) : 20;
  const db = adminSupabase();
  const { data: jobs, error } = await db.from('generation_jobs')
    .select('id,job_type,provider,model,status,prompt,metadata,error_message,created_at,completed_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: 'Studio history is unavailable.' }, { status: 503 });
  if (!jobs?.length) return NextResponse.json({ jobs: [] }, { headers: { 'Cache-Control': 'private, no-store' } });

  const jobIds = jobs.map(job => job.id);
  const { data: assets, error: assetError } = await db.from('media_assets')
    .select('id,job_id,kind,bucket,storage_path,mime_type,size_bytes,created_at')
    .eq('user_id', ctx.user.id)
    .in('job_id', jobIds);
  if (assetError) return NextResponse.json({ error: 'Studio media history is unavailable.' }, { status: 503 });

  const assetResults = await Promise.all((assets || []).map(async asset => {
    const { data: signed, error: signError } = await db.storage.from(asset.bucket).createSignedUrl(asset.storage_path, 60 * 60);
    if (signError || !signed?.signedUrl) return null;
    return {
      id: asset.id,
      job_id: asset.job_id,
      kind: asset.kind,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      created_at: asset.created_at,
      url: signed.signedUrl,
      url_expires_in: 3600,
    };
  }));
  if (assetResults.some(asset => asset === null)) {
    return NextResponse.json({ error: 'A secure studio media preview could not be created.' }, { status: 502 });
  }

  const safeJobs = jobs.map(job => ({
    id: job.id,
    job_type: job.job_type,
    provider: job.provider,
    model: job.model,
    status: job.status,
    prompt: job.prompt,
    error_message: job.error_message,
    created_at: job.created_at,
    completed_at: job.completed_at,
    asset_id: typeof job.metadata?.asset_id === 'string' ? job.metadata.asset_id : null,
    source_asset_id: typeof job.metadata?.source_asset_id === 'string' ? job.metadata.source_asset_id : null,
  }));
  return NextResponse.json({ jobs: safeJobs, assets: assetResults }, { headers: { 'Cache-Control': 'private, no-store' } });
}
