import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getModelProviderStatus } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ModelCheck = {
  model: string;
  credential_status: 'missing' | 'accepted' | 'rejected' | 'unknown';
  model_access: 'available' | 'denied' | 'not_found' | 'unknown';
  generation_method_supported: boolean | null;
  quota_status: 'available_on_last_generation' | 'rate_or_quota_limited' | 'unknown';
  detail?: string;
};

export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ error: 'Owner authentication is required.' }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const catalog = getModelProviderStatus();
  if (!apiKey) {
    return NextResponse.json({
      provider: 'google',
      checked_at: new Date().toISOString(),
      credential_status: 'missing',
      models: catalog.map(item => ({
        model: item.model,
        credential_status: 'missing',
        model_access: 'unknown',
        generation_method_supported: null,
        quota_status: 'unknown',
      })),
      quota_note: 'Gemini does not expose remaining per-model inference quota through the model metadata endpoint. A successful generation proves quota was available at that moment; HTTP 429 indicates a rate or quota limit.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const models: ModelCheck[] = await Promise.all(catalog.map(async item => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item.model)}`,
        { method: 'GET', headers: { 'x-goog-api-key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(8_000) },
      );
      if (response.ok) {
        const metadata = await response.json() as { supportedGenerationMethods?: string[] };
        const supported = Array.isArray(metadata.supportedGenerationMethods)
          && metadata.supportedGenerationMethods.includes('generateContent');
        return {
          model: item.model,
          credential_status: 'accepted',
          model_access: supported ? 'available' : 'denied',
          generation_method_supported: supported,
          quota_status: item.health_status_code === 429 ? 'rate_or_quota_limited' : item.operational ? 'available_on_last_generation' : 'unknown',
          ...(!supported ? { detail: 'The API key can read model metadata, but generateContent is not listed as a supported method.' } : {}),
        };
      }
      if (response.status === 401 || response.status === 403) return {
        model: item.model, credential_status: 'rejected', model_access: 'denied',
        generation_method_supported: null, quota_status: item.health_status_code === 429 ? 'rate_or_quota_limited' : item.operational ? 'available_on_last_generation' : 'unknown',
        detail: response.status === 401 ? 'Google rejected the API credential.' : 'Google denied access to this model or API for the configured project.',
      };
      if (response.status === 404) return {
        model: item.model, credential_status: 'accepted', model_access: 'not_found',
        generation_method_supported: false, quota_status: item.health_status_code === 429 ? 'rate_or_quota_limited' : item.operational ? 'available_on_last_generation' : 'unknown',
        detail: 'Google could not resolve this model ID for the configured API.',
      };
      return {
        model: item.model, credential_status: 'unknown', model_access: 'unknown',
        generation_method_supported: null, quota_status: 'unknown',
        detail: `Google model metadata check returned HTTP ${response.status}.`,
      };
    } catch {
      return {
        model: item.model, credential_status: 'unknown', model_access: 'unknown',
        generation_method_supported: null, quota_status: item.health_status_code === 429 ? 'rate_or_quota_limited' : item.operational ? 'available_on_last_generation' : 'unknown',
        detail: 'Google model metadata check failed due to a network or timeout error.',
      };
    }
  }));

  const accepted = models.some(model => model.credential_status === 'accepted');
  return NextResponse.json({
    provider: 'google',
    checked_at: new Date().toISOString(),
    credential_status: models.some(model => model.credential_status === 'rejected') && !accepted
      ? 'rejected' : accepted ? 'accepted' : 'unknown',
    models,
    quota_note: 'Google does not expose remaining per-model inference quota through this metadata API. Quota is reported independently from actual generation responses: HTTP 429 means a rate/quota limit; successful generation confirms quota was available at that time. This diagnostic does not run generation and does not consume inference tokens.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
