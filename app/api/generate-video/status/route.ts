import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { getRunwayVideo } from '@/lib/agents/runway-video';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to access this video job.' }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get('job_id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: 'A valid job_id is required.' }, { status: 400 });
  const db = adminSupabase();
  const { data: job, error } = await db.from('generation_jobs').select('id,user_id,job_type,provider,model,status,provider_task_id,platform_credits_reserved,credit_source,metadata,error_message').eq('id', jobId).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Video job history is unavailable.' }, { status: 500 });
  if (!job || job.job_type !== 'video' || job.provider !== 'runway') return NextResponse.json({ error: 'Video job not found.' }, { status: 404 });
  if (job.status === 'completed') {
    const { data: asset } = await db.from('media_assets').select('id').eq('job_id', job.id).eq('user_id', ctx.user.id).maybeSingle();
    if (!asset) return NextResponse.json({ job_id: job.id, status: 'failed', error: 'The video output record is missing.' }, { status: 500 });
    const { data: signed } = await db.storage.from('leo-files').createSignedUrl(`agent-videos/${ctx.user.id}/${job.provider_task_id}.mp4`, 60 * 60);
    return NextResponse.json({ job_id: job.id, status: 'completed', asset_id: asset.id, video_url: signed?.signedUrl || null, url_expires_in: 3600, platform_credits_charged: job.platform_credits_reserved }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (job.status === 'failed' || job.status === 'cancelled') return NextResponse.json({ job_id: job.id, status: job.status, error: job.error_message || 'Video generation did not complete.' });
  if (!job.provider_task_id) return NextResponse.json({ job_id: job.id, status: job.status, message: 'The provider task is being initialized.' }, { headers: { 'Cache-Control': 'private, no-store' } });

  try {
    const result = await getRunwayVideo(job.provider_task_id, undefined, ctx.user.id);
    if (result.status === 'processing') return NextResponse.json({ job_id: job.id, status: 'processing', task_id: job.provider_task_id }, { headers: { 'Cache-Control': 'private, no-store' } });
    if (result.status === 'failed') {
      if (job.credit_source === 'platform' && Number(job.platform_credits_reserved) > 0) await db.rpc('refund_platform_credits', { p_user_id: ctx.user.id, p_job_id: job.id, p_cost: Number(job.platform_credits_reserved) });
      await db.from('generation_jobs').update({ status: 'failed', error_code: 'provider_task_failed', error_message: 'The video provider could not complete this task. Reserved platform credits were returned when possible.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
      return NextResponse.json({ job_id: job.id, status: 'failed', error: 'The video provider could not complete this task. Reserved platform credits were returned when possible.' });
    }
    const storagePath = `agent-videos/${ctx.user.id}/${job.provider_task_id}.mp4`;
    const { data: fileList } = await db.storage.from('leo-files').list(`agent-videos/${ctx.user.id}`, { search: `${job.provider_task_id}.mp4`, limit: 1 });
    const file = fileList?.find((item) => item.name === `${job.provider_task_id}.mp4`);
    if (!file) throw new Error('VIDEO_STORAGE_FAILED');
    const { data: asset, error: assetError } = await db.from('media_assets').insert({ user_id: ctx.user.id, job_id: job.id, kind: 'video', bucket: 'leo-files', storage_path: storagePath, mime_type: 'video/mp4', size_bytes: Number(file.metadata?.size || 0), metadata: { provider: 'runway', model: job.model, duration_seconds: job.metadata?.duration_seconds, aspect_ratio: job.metadata?.aspect_ratio } }).select('id').single();
    if (assetError && assetError.code !== '23505') throw new Error('VIDEO_STORAGE_FAILED');
    const { data: savedAsset } = assetError?.code === '23505'
      ? await db.from('media_assets').select('id').eq('job_id', job.id).eq('user_id', ctx.user.id).maybeSingle()
      : { data: asset };
    const { data: signed, error: signError } = await db.storage.from('leo-files').createSignedUrl(storagePath, 60 * 60);
    if (signError || !signed?.signedUrl || !savedAsset) throw new Error('VIDEO_STORAGE_FAILED');
    await db.from('generation_jobs').update({ status: 'completed', platform_credits_charged: Number(job.platform_credits_reserved), metadata: { ...(job.metadata || {}), asset_id: savedAsset.id, storage_path: storagePath }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
    return NextResponse.json({ job_id: job.id, status: 'completed', asset_id: savedAsset.id, video_url: signed.signedUrl, url_expires_in: 3600, platform_credits_charged: Number(job.platform_credits_reserved) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (pollError) {
    if (pollError instanceof Error && (pollError.message === 'VIDEO_STORAGE_FAILED' || /could not be (saved to|downloaded for) private storage|secure video URL could not be issued/i.test(pollError.message))) {
      if (job.credit_source === 'platform' && Number(job.platform_credits_reserved) > 0) await db.rpc('refund_platform_credits', { p_user_id: ctx.user.id, p_job_id: job.id, p_cost: Number(job.platform_credits_reserved) });
      await db.from('generation_jobs').update({ status: 'failed', error_code: 'storage_failed', error_message: 'The completed video could not be saved to private storage. Reserved platform credits were returned when possible.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
      return NextResponse.json({ job_id: job.id, status: 'failed', error: 'The completed video could not be saved to private storage. Reserved platform credits were returned when possible.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Video status is temporarily unavailable. The job remains tracked; retry status polling.' }, { status: 502 });
  }
}
