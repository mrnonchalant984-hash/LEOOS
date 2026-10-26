import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { accountAccess, consumeCredit } from '@/lib/access';
import { generateGeminiImage, isGeminiImageModel, resolveGeminiImageModel } from './gemini-image';

const BUCKET = 'leo-files';
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function generateImageWithProviderFallback(prompt: string, preferredModel: string) {
  const googleKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!googleKey) throw new Error('Gemini image generation is not configured.');
  const primaryModel = preferredModel.replace(/^google\//, '').trim();

  const generate = async (model: string) => {
    if (isGeminiImageModel(model)) {
      const generated = await generateGeminiImage(prompt, undefined, model);
      return { image: generated.image, provider: 'google', model: generated.model };
    }
    if (!model.startsWith('imagen-')) throw new Error('The configured Gemini image model is not image-capable.');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleKey },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const providerMessage = typeof payload?.error?.message === 'string' ? payload.error.message.slice(0, 300) : `HTTP ${response.status}`;
      throw new Error(`Gemini image generation failed (${response.status}): ${providerMessage}`);
    }
    const prediction = payload?.predictions?.[0];
    const base64 = prediction?.bytesBase64Encoded || prediction?.bytes_base64_encoded;
    if (typeof base64 !== 'string' || !base64) throw new Error('Gemini image generation returned no image data.');
    return { image: { b64_json: base64, output_format: String(prediction.mimeType || prediction.mime_type || 'image/png').includes('jpeg') ? 'jpeg' : 'png' }, provider: 'google', model };
  };

  try {
    return await generate(primaryModel);
  } catch (primaryError) {
    const fallbackModel = resolveGeminiImageModel(process.env.LEO_GEMINI_IMAGE_FALLBACK_MODEL?.trim() || 'gemini-2.5-flash-image-preview');
    if (fallbackModel === primaryModel) throw primaryError;
    return generate(fallbackModel);
  }
}


type ImageJobOptions = {
  userId: string;
  prompt: string;
  mode?: 'image' | 'diagram' | '3d';
  requestKey?: string | null;
};

function safeMessage(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (/credit|plan|entitled|subscription|configured model|image-capable|not configured|provider failed|returned no image|unsupported image/i.test(text)) return text.slice(0, 240);
  return 'Image generation failed. Any reserved credits were returned when possible. Please retry.';
}

async function refund(db: ReturnType<typeof adminSupabase>, userId: string, jobId: string, source: string | null, cost: number) {
  if (!source) return;
  if (source === 'platform') {
    await db.rpc('refund_platform_credits', { p_user_id: userId, p_job_id: jobId, p_cost: cost });
    return;
  }
  if (source === 'legacy_feature') {
    await db.rpc('refund_user_feature_credit', { p_user_id: userId, p_feature: 'image_generation', p_job_id: jobId, p_cost: 1 });
  }
}

async function getImageBytes(image: any): Promise<{ bytes: Buffer; mime: string }> {
  if (typeof image?.b64_json === 'string' && image.b64_json.length > 0) {
    const bytes = Buffer.from(image.b64_json, 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Generated image size is invalid.');
    const format = String(image.output_format || 'png').toLowerCase();
    const mime = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    return { bytes, mime };
  }
  if (typeof image?.url === 'string') {
    const url = new URL(image.url);
    if (url.protocol !== 'https:') throw new Error('Provider returned an invalid image URL.');
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
    if (!response.ok) throw new Error('Generated image could not be retrieved from the provider.');
    const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new Error('Provider returned an unsupported image format.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Generated image size is invalid.');
    return { bytes, mime };
  }
  throw new Error('Provider returned no image data.');
}

export async function generateAndPersistImage(options: ImageJobOptions) {
  const db = adminSupabase();
  const access = await accountAccess(options.userId, 'image_generation');
  if (!access.owner && !access.entitled) throw new Error('Image generation is not included in your current plan.');
  const configuredImageModel = process.env.LEO_GEMINI_IMAGE_MODEL?.trim();
  const model = resolveGeminiImageModel(configuredImageModel);
  const requestKey = options.requestKey?.trim().slice(0, 128) || randomUUID();
  const mode = options.mode || 'image';
  const visualDirection = mode === '3d'
    ? 'Create a polished 3D-rendered concept image. This is a still image, not an interactive 3D model.'
    : mode === 'diagram'
      ? 'Create a clear, high-contrast diagram or visual explainer. Keep labels large and concise.'
      : '';
  const { data: job, error: jobError } = await db.from('generation_jobs').insert({
    user_id: options.userId,
    request_key: requestKey,
    job_type: 'image',
    provider: 'google',
    model,
    status: 'queued',
    prompt: options.prompt,
    metadata: { mode, quality: 'medium', size: '1024x1024' },
  }).select('id,status').single();

  if (jobError) {
    if (jobError.code === '23505') {
      const { data: existing } = await db.from('generation_jobs')
        .select('id,status,metadata,error_message,platform_credits_charged,credit_source')
        .eq('user_id', options.userId).eq('request_key', requestKey).maybeSingle();
      if (existing?.status === 'completed' && existing.metadata?.asset_id) {
        const { data: asset } = await db.from('media_assets').select('id').eq('id', existing.metadata.asset_id).eq('user_id', options.userId).maybeSingle();
        if (asset) {
          const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(String(existing.metadata.storage_path), SIGNED_URL_SECONDS);
          if (signed?.signedUrl) return { job_id: existing.id, asset_id: asset.id, url: signed.signedUrl, credits_remaining: null, platform_credits_charged: existing.platform_credits_charged, duplicate: true };
        }
      }
      throw Object.assign(new Error('This request is already being processed or has already failed. Use a new request ID to retry.'), { statusCode: 409 });
    }
    throw new Error('Generation jobs are not available. Apply the LeonardX generation migration before enabling this endpoint.');
  }

  let creditSource: string | null = null;
  let storagePath: string | null = null;
  let assetId: string | null = null;
  let platformCost = Math.max(1, Number.parseInt(process.env.LEO_IMAGE_PLATFORM_CREDITS || '1', 10) || 1);
  let creditsRemaining: number | null = null;
  try {
    const reserve = await db.rpc('reserve_platform_credits', { p_user_id: options.userId, p_job_id: job.id, p_cost: platformCost });
    if (!reserve.error) {
      creditSource = 'platform';
      creditsRemaining = Number(reserve.data);
    } else if (/insufficient platform credits/i.test(reserve.error.message || '')) {
      const legacy = await consumeCredit(options.userId, 'image_generation');
      const isOwner = 'owner' in legacy && legacy.owner === true;
      creditSource = isOwner ? null : 'legacy_feature';
      creditsRemaining = 'remaining' in legacy ? legacy.remaining : legacy.credits;
      platformCost = 0;
    } else {
      throw new Error('Platform credit accounting is unavailable. Apply the required database migration before generating images.');
    }
    await db.from('generation_jobs').update({ status: 'processing', credit_source: creditSource, platform_credits_reserved: platformCost, updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', options.userId);

    const finalPrompt = visualDirection ? `${visualDirection}\n\n${options.prompt}` : options.prompt;
    const generated = await generateImageWithProviderFallback(finalPrompt, model);
    const image = generated.image;
    await db.from('generation_jobs').update({ provider: generated.provider, model: generated.model, updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', options.userId);
    const { bytes, mime } = await getImageBytes(image);
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    storagePath = `generated-images/${options.userId}/${job.id}.${extension}`;
    const upload = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
    if (upload.error) throw new Error('Generated image could not be saved to private storage.');

    const { data: asset, error: assetError } = await db.from('media_assets').insert({
      user_id: options.userId,
      job_id: job.id,
      kind: 'image',
      bucket: BUCKET,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: bytes.length,
      metadata: { provider: generated.provider, model: generated.model, mode, width: 1024, height: 1024 },
    }).select('id').single();
    if (assetError) {
      await db.storage.from(BUCKET).remove([storagePath]);
      throw new Error('Generated image metadata could not be saved.');
    }
    assetId = asset.id;
    const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    if (signError || !signed?.signedUrl) throw new Error('Generated image was saved but a secure preview URL could not be issued.');

    const metadata = { mode, asset_id: asset.id, storage_path: storagePath, mime_type: mime, size_bytes: bytes.length };
    const { error: completeError } = await db.from('generation_jobs').update({
      status: 'completed', platform_credits_charged: platformCost, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata,
    }).eq('id', job.id).eq('user_id', options.userId);
    if (completeError) throw new Error('Generation completed but job history could not be finalized.');

    const { data: platformAccount } = await db.from('platform_credit_accounts').select('balance').eq('user_id', options.userId).maybeSingle();
    return { job_id: job.id, asset_id: asset.id, url: signed.signedUrl, credits_remaining: creditsRemaining, platform_credits_remaining: platformAccount?.balance ?? null, platform_credits_charged: platformCost, url_expires_in: SIGNED_URL_SECONDS };
  } catch (error) {
    if (assetId) await db.from('media_assets').delete().eq('id', assetId).eq('user_id', options.userId);
    if (storagePath) await db.storage.from(BUCKET).remove([storagePath]);
    await refund(db, options.userId, job.id, creditSource, creditSource === 'legacy_feature' ? 1 : platformCost);
    const statusCode = (error as { statusCode?: number })?.statusCode;
    await db.from('generation_jobs').update({ status: 'failed', error_code: statusCode === 409 ? 'duplicate_request' : 'generation_failed', error_message: safeMessage(error), updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', options.userId);
    throw error;
  }
}
