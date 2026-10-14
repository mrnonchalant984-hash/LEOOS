import { randomUUID } from 'node:crypto';
import { toFile } from 'openai/uploads';
import { adminSupabase } from '@/lib/auth';
import { accountAccess, consumeCredit } from '@/lib/access';
import { getOpenAI } from '@/lib/openai';
import { inspectImageUpload } from '@/lib/generation/image-input';

const BUCKET = 'leo-files';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

export class ImageEditError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ImageEditError';
  }
}

type EditOptions = {
  userId: string;
  prompt: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  requestKey: string;
};

function getImageBytes(image: { b64_json?: string | null; output_format?: string | null }) {
  if (!image.b64_json) throw new Error('The image provider returned no result.');
  const bytes = Buffer.from(image.b64_json, 'base64');
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('The generated image size is invalid.');
  const format = image.output_format?.toLowerCase();
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return { bytes, mimeType, extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png' };
}

async function signAsset(db: ReturnType<typeof adminSupabase>, storagePath: string) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('A secure image preview could not be created.');
  return data.signedUrl;
}

export async function editAndPersistImage(options: EditOptions) {
  if (options.prompt.length < 3 || options.prompt.length > 2000) throw new ImageEditError('Enter an edit prompt between 3 and 2,000 characters.', 400);
  if (options.bytes.length > MAX_IMAGE_BYTES) throw new ImageEditError('Choose an image no larger than 4 MB.', 413);
  const format = inspectImageUpload(options.bytes, options.mimeType);
  if (!format) throw new ImageEditError('Upload a valid PNG, JPEG, or WebP image.', 400);
  if (!process.env.OPENAI_API_KEY && !process.env.LEO_API_KEY) throw new ImageEditError('Image editing is not configured. No credits were charged.', 503);
  if (process.env.LEO_OFFLINE_MODE === 'true') throw new ImageEditError('Image editing is unavailable while hosted providers are disabled.', 503);

  const db = adminSupabase();
  const access = await accountAccess(options.userId, 'image_generation');
  if (!access.owner && !access.entitled) throw new ImageEditError('Image editing requires an eligible plan or image credits.', 403);

  const requestKey = options.requestKey.trim();
  const { data: job, error: jobError } = await db.from('generation_jobs').insert({
    user_id: options.userId,
    request_key: requestKey,
    job_type: 'image',
    provider: 'openai',
    model: process.env.LEO_IMAGE_MODEL || 'gpt-image-2',
    status: 'queued',
    prompt: options.prompt,
    metadata: { mode: 'edit', input_filename: options.filename.slice(0, 160) },
  }).select('id,model').single();

  if (jobError) {
    if (jobError.code === '23505') {
      const { data: existing } = await db.from('generation_jobs')
        .select('id,status,metadata')
        .eq('user_id', options.userId)
        .eq('request_key', requestKey)
        .maybeSingle();
      if (existing?.status === 'completed' && existing.metadata?.asset_id && existing.metadata?.storage_path) {
        const { data: asset } = await db.from('media_assets').select('id').eq('id', existing.metadata.asset_id).eq('user_id', options.userId).maybeSingle();
        if (asset) {
          return {
            job_id: existing.id,
            asset_id: asset.id,
            source_asset_id: existing.metadata.source_asset_id,
            url: await signAsset(db, String(existing.metadata.storage_path)),
            duplicate: true,
          };
        }
      }
      throw new ImageEditError('This request is already being processed or has failed. Use a new request ID to retry.', 409);
    }
    throw new ImageEditError('Image editing is temporarily unavailable. Confirm the generation database migration is applied.', 503);
  }

  let creditSource: string | null = null;
  let creditCost = Math.max(1, Number.parseInt(process.env.LEO_IMAGE_PLATFORM_CREDITS || '1', 10) || 1);
  let inputStoragePath: string | null = null;
  let outputStoragePath: string | null = null;
  let inputAssetId: string | null = null;
  let outputAssetId: string | null = null;

  try {
    if (!access.owner) {
      const reserve = await db.rpc('reserve_platform_credits', { p_user_id: options.userId, p_job_id: job.id, p_cost: creditCost });
      if (!reserve.error) {
        creditSource = 'platform';
      } else if (/insufficient platform credits/i.test(reserve.error.message || '')) {
        try {
          await consumeCredit(options.userId, 'image_generation');
          creditSource = 'legacy_feature';
          creditCost = 1;
        } catch {
          throw new ImageEditError('Your image credit balance is insufficient. No image was edited.', 402);
        }
      } else {
        throw new ImageEditError('Credit accounting is unavailable. No image was edited.', 503);
      }
    }
    const { error: processingError } = await db.from('generation_jobs').update({
      status: 'processing',
      credit_source: creditSource,
      platform_credits_reserved: creditSource === 'platform' ? creditCost : 0,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('user_id', options.userId);
    if (processingError) throw new ImageEditError('Image-edit job tracking is unavailable. No image was edited.', 503);

    inputStoragePath = `studio-inputs/${options.userId}/${job.id}.${format.extension}`;
    const inputUpload = await db.storage.from(BUCKET).upload(inputStoragePath, options.bytes, {
      contentType: format.mimeType,
      upsert: false,
      cacheControl: '3600',
    });
    if (inputUpload.error) throw new Error('The original image could not be saved to private storage.');
    const { data: inputAsset, error: inputAssetError } = await db.from('media_assets').insert({
      user_id: options.userId,
      job_id: job.id,
      kind: 'image',
      bucket: BUCKET,
      storage_path: inputStoragePath,
      mime_type: format.mimeType,
      size_bytes: options.bytes.length,
      metadata: { role: 'source', mode: 'edit' },
    }).select('id').single();
    if (inputAssetError) throw new Error('The original image metadata could not be saved.');
    inputAssetId = inputAsset.id;

    const inputFile = await toFile(options.bytes, `source.${format.extension}`, { type: format.mimeType });
    const generated = await getOpenAI().images.edit({
      model: job.model,
      image: inputFile,
      prompt: options.prompt,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
      output_format: 'png',
    });
    const image = generated.data?.[0];
    if (!image) throw new Error('The image provider returned no result.');
    const output = getImageBytes(image);
    outputStoragePath = `studio-edits/${options.userId}/${job.id}.${output.extension}`;
    const outputUpload = await db.storage.from(BUCKET).upload(outputStoragePath, output.bytes, {
      contentType: output.mimeType,
      upsert: false,
      cacheControl: '3600',
    });
    if (outputUpload.error) throw new Error('The edited image could not be saved to private storage.');
    const { data: outputAsset, error: outputAssetError } = await db.from('media_assets').insert({
      user_id: options.userId,
      job_id: job.id,
      kind: 'image',
      bucket: BUCKET,
      storage_path: outputStoragePath,
      mime_type: output.mimeType,
      size_bytes: output.bytes.length,
      metadata: { provider: 'openai', model: job.model, role: 'result', source_asset_id: inputAsset.id, mode: 'edit' },
    }).select('id').single();
    if (outputAssetError) throw new Error('The edited image metadata could not be saved.');
    outputAssetId = outputAsset.id;

    const url = await signAsset(db, outputStoragePath);
    const { error: completeError } = await db.from('generation_jobs').update({
      status: 'completed',
      platform_credits_charged: creditSource === 'platform' ? creditCost : 0,
      metadata: {
        mode: 'edit',
        source_asset_id: inputAsset.id,
        asset_id: outputAsset.id,
        storage_path: outputStoragePath,
        model: job.model,
      },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('user_id', options.userId);
    if (completeError) throw new Error('The edit completed, but its job record could not be finalized.');
    return { job_id: job.id, asset_id: outputAsset.id, source_asset_id: inputAsset.id, url, model: job.model };
  } catch (error) {
    if (outputAssetId) await db.from('media_assets').delete().eq('id', outputAssetId).eq('user_id', options.userId);
    if (outputStoragePath) await db.storage.from(BUCKET).remove([outputStoragePath]);
    if (inputAssetId) await db.from('media_assets').delete().eq('id', inputAssetId).eq('user_id', options.userId);
    if (inputStoragePath) await db.storage.from(BUCKET).remove([inputStoragePath]);

    let refundFailed = false;
    if (creditSource === 'platform') {
      const { error: refundError } = await db.rpc('refund_platform_credits', { p_user_id: options.userId, p_job_id: job.id, p_cost: creditCost });
      refundFailed = Boolean(refundError);
    } else if (creditSource === 'legacy_feature') {
      const { error: refundError } = await db.rpc('refund_user_feature_credit', { p_user_id: options.userId, p_feature: 'image_generation', p_job_id: job.id, p_cost: 1 });
      refundFailed = Boolean(refundError);
    }
    const safeError = error instanceof ImageEditError ? error.message : 'Image editing failed. Any reserved credits were returned when possible.';
    await db.from('generation_jobs').update({
      status: 'failed',
      error_code: error instanceof ImageEditError ? 'request_rejected' : 'edit_failed',
      error_message: refundFailed ? 'Image edit failed and credit refund could not be confirmed.' : safeError,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('user_id', options.userId);
    if (refundFailed) throw new ImageEditError('Image editing failed and the credit refund could not be confirmed. Contact support.', 503);
    throw error;
  }
}
