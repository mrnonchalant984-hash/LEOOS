import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { createRunwayVideo } from '@/lib/agents/runway-video';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to check video generation options.' }, { status: 401 });
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!owner && !planAllows(plan, 'video-generation')) return NextResponse.json({ available: false, error: 'Video generation requires a Pro or Business plan.' }, { status: 403 });
  const model = process.env.RUNWAY_VIDEO_MODEL || 'gen4.5';
  const configuredRate = Number.parseInt(process.env.RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND || '', 10);
  const rate = Number.isSafeInteger(configuredRate) && configuredRate > 0 ? configuredRate : null;
  if (model !== 'gen4.5') return NextResponse.json({ available: false, error: 'Only Runway Gen-4.5 is currently supported by this video workflow.' }, { status: 503 });
  if (!owner && rate === null) return NextResponse.json({ available: false, model, error: 'Video generation is temporarily unavailable. Please try again later.' }, { status: 503 });
  const duration = Number.parseInt(req.nextUrl.searchParams.get('duration') || '5', 10);
  if (!Number.isInteger(duration) || duration < 2 || duration > 10) return NextResponse.json({ error: 'Duration must be between 2 and 10 seconds.' }, { status: 400 });
  const { data: account } = await adminSupabase().from('platform_credit_accounts').select('balance').eq('user_id', ctx.user.id).maybeSingle();
  const required = owner ? 0 : (rate as number) * duration;
  return NextResponse.json({ available: true, model, duration_seconds: duration, supported_durations: [2,3,4,5,6,7,8,9,10], aspect_ratios: ['landscape','portrait'], platform_credits_required: required, platform_credits_per_second: rate, platform_credits_available: account?.balance ?? 0, provider_cost_estimate_usd: Number((duration * 0.12).toFixed(2)), provider_cost_usd: null, mode: 'text_to_video' }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to generate video.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const sourceAssetId = typeof body?.image_asset_id === 'string' ? body.image_asset_id : '';
  if (body?.image_asset_id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceAssetId)) {
    return NextResponse.json({ error: 'Choose a valid source image from your private library.' }, { status: 400 });
  }
  const duration = body?.duration === undefined ? 5 : Number(body.duration);
  const aspectRatio = body?.aspect_ratio === 'portrait' ? 'portrait' : body?.aspect_ratio === 'landscape' || body?.aspect_ratio === undefined ? 'landscape' : null;
  if (prompt.length < 3 || prompt.length > 2000) return NextResponse.json({ error: 'Enter a video prompt between 3 and 2,000 characters.' }, { status: 400 });
  if (!Number.isInteger(duration) || duration < 2 || duration > 10) return NextResponse.json({ error: 'Gen-4.5 duration must be a whole number between 2 and 10 seconds.' }, { status: 400 });
  if (!aspectRatio) return NextResponse.json({ error: 'Choose a supported aspect ratio: landscape or portrait.' }, { status: 400 });

  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!owner && !planAllows(plan, 'video-generation')) return NextResponse.json({ error: 'Video generation is not included in your current plan. Review the available plans to upgrade.' }, { status: 403 });

  const configuredCreditsPerSecond = Number.parseInt(process.env.RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND || '', 10);
  const creditsPerSecond = Number.isSafeInteger(configuredCreditsPerSecond) && configuredCreditsPerSecond > 0 ? configuredCreditsPerSecond : null;
  if (!owner && creditsPerSecond === null) {
    return NextResponse.json({ error: 'Video generation is temporarily unavailable. No credits were charged.' }, { status: 503 });
  }
  const platformCost = owner ? 0 : (creditsPerSecond as number) * duration;
  if (!Number.isSafeInteger(platformCost) || platformCost > 10000) return NextResponse.json({ error: 'The configured video credit cost is invalid.' }, { status: 503 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'video-generation', owner ? 10 : 3, 3600);
  if (limited) return limited;

  const requestKey = req.headers.get('idempotency-key') || (typeof body?.request_id === 'string' ? body.request_id : randomUUID());
  if (requestKey.length > 128 || /[\r\n]/.test(requestKey)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  const model = process.env.RUNWAY_VIDEO_MODEL || 'gen4.5';
  if (model !== 'gen4.5') return NextResponse.json({ error: 'This endpoint currently supports the Runway Gen-4.5 model only.' }, { status: 503 });

  const db = adminSupabase();
  let imageUrl: string | undefined;
  if (sourceAssetId) {
    const { data: sourceAsset, error: sourceError } = await db.from('media_assets')
      .select('id,bucket,storage_path,mime_type,kind')
      .eq('id', sourceAssetId)
      .eq('user_id', ctx.user.id)
      .maybeSingle();
    if (sourceError) return NextResponse.json({ error: 'The selected source image could not be checked.' }, { status: 503 });
    if (!sourceAsset || sourceAsset.kind !== 'image' || sourceAsset.bucket !== 'leo-files' || !sourceAsset.mime_type?.startsWith('image/')) {
      return NextResponse.json({ error: 'Source image not found in your private library.' }, { status: 404 });
    }
    const { data: signedSource, error: signError } = await db.storage.from('leo-files')
      .createSignedUrl(sourceAsset.storage_path, 60 * 10);
    if (signError || !signedSource?.signedUrl) {
      return NextResponse.json({ error: 'A temporary source image URL could not be created.' }, { status: 503 });
    }
    imageUrl = signedSource.signedUrl;
  }
  const { data: job, error: insertError } = await db.from('generation_jobs').insert({
    user_id: ctx.user.id, request_key: requestKey, job_type: 'video', provider: 'runway', model,
    status: 'queued', prompt, platform_credits_reserved: platformCost,
    metadata: { duration_seconds: duration, aspect_ratio: aspectRatio, mode: imageUrl ? 'image_to_video' : 'text_to_video', source_asset_id: sourceAssetId || null, platform_credits_per_second: creditsPerSecond, provider_cost_usd: null, provider_cost_estimate_usd: Number((duration * 0.12).toFixed(2)) },
  }).select('id,status').single();
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: existing } = await db.from('generation_jobs').select('id,status,provider_task_id,metadata').eq('user_id', ctx.user.id).eq('request_key', requestKey).maybeSingle();
      if (existing) return NextResponse.json({ job_id: existing.id, status: existing.status, task_id: existing.provider_task_id || null, duplicate: true, ...existing.metadata }, { status: existing.status === 'failed' ? 409 : 200, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ error: 'Video generation could not be started. Please try again later.' }, { status: 503 });
  }

  let reserved = false;
  try {
    const reserve = platformCost > 0 ? await db.rpc('reserve_platform_credits', { p_user_id: ctx.user.id, p_job_id: job.id, p_cost: platformCost }) : { error: null, data: 0 };
    if (reserve.error) {
      if (/insufficient platform credits/i.test(reserve.error.message || '')) {
        await db.from('generation_jobs').update({ status: 'failed', error_code: 'insufficient_credits', error_message: 'Insufficient platform credits.', completed_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
        return NextResponse.json({ error: `This video requires ${platformCost} platform credits. Your available balance is insufficient. No credits were charged.` }, { status: 402 });
      }
      throw new Error('Video generation could not be started.');
    }
    reserved = platformCost > 0;
    await db.from('generation_jobs').update({ status: 'processing', credit_source: platformCost > 0 ? 'platform' : null, platform_credits_reserved: platformCost, updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
    const created = await createRunwayVideo({ prompt, imageUrl, duration, ratio: aspectRatio === 'portrait' ? '768:1280' : '1280:768', model });
    const { error: updateError } = await db.from('generation_jobs').update({ provider_task_id: created.task_id, status: 'processing', updated_at: new Date().toISOString(), metadata: { duration_seconds: duration, aspect_ratio: aspectRatio, mode: imageUrl ? 'image_to_video' : 'text_to_video', source_asset_id: sourceAssetId || null, platform_credits_per_second: creditsPerSecond, provider_cost_usd: null, provider_cost_estimate_usd: Number((duration * 0.12).toFixed(2)) } }).eq('id', job.id).eq('user_id', ctx.user.id);
    if (updateError) throw new Error('Provider task started but its tracking record could not be updated. Contact support before retrying.');
    const { data: account } = await db.from('platform_credit_accounts').select('balance').eq('user_id', ctx.user.id).maybeSingle();
    return NextResponse.json({ job_id: job.id, task_id: created.task_id, status: 'processing', provider: 'runway', model, mode: imageUrl ? 'image_to_video' : 'text_to_video', source_asset_id: sourceAssetId || null, duration_seconds: duration, aspect_ratio: aspectRatio, platform_credits_charged: platformCost, platform_credits_remaining: account?.balance ?? null, provider_cost_estimate_usd: Number((duration * 0.12).toFixed(2)), provider_cost_usd: null }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (reserved) await db.rpc('refund_platform_credits', { p_user_id: ctx.user.id, p_job_id: job.id, p_cost: platformCost });
    await db.from('generation_jobs').update({ status: 'failed', error_code: 'provider_start_failed', error_message: 'Video generation could not be started. Any reserved platform credits were returned when possible.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', ctx.user.id);
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: /tracking record/i.test(message) ? message : 'Video generation could not be started. Any reserved platform credits were returned when possible.' }, { status: /platform credit accounting/i.test(message) ? 503 : 502 });
  }
}
