import { isProviderConfigured, ModelProviderError, resolveModel } from './model-catalog.ts';

function providerStatus(error: unknown) {
  if (error instanceof ModelProviderError) return error.statusCode;
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
  return null;
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = 'cause' in error && error.cause && typeof error.cause === 'object'
    ? error.cause as { code?: unknown }
    : null;
  const code = typeof cause?.code === 'string' ? cause.code : '';
  return /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|UND_ERR_SOCKET)$/.test(code) ||
    (error instanceof TypeError && /fetch|network|socket/i.test(error.message));
}

export function isRetryableProviderFailure(error: unknown) {
  const status = providerStatus(error);
  return status === 401 || status === 403 || status === 408 || status === 409 || status === 429 || status === 404 || (status !== null && status >= 500) || (status === null && isTransientNetworkError(error));
}


export function getSafeFallbackModel(
  primaryModel: string,
  configuredFallback = process.env.LEO_FALLBACK_MODEL?.trim(),
  _customAgent = false,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
): string | undefined {

  // A stale deployment variable must not prevent ordinary chat from working.
  // Google AI Studio model IDs such as gemini-3.8-flash are unqualified; resolveModel
  // normalizes them. Otherwise use the configured Gemini chat model for fallback.
  const primary = resolveModel(primaryModel);
  if (configuredFallback) {
    try {
      const fallback = resolveModel(configuredFallback);
      if (fallback.provider !== primary.provider && configured(fallback.provider)) {
        return `${fallback.provider}/${fallback.model}`;
      }
    } catch {
      // Ignore stale/unsupported fallback configuration and continue to the
      // safe automatic fallback below.
    }
  }

  if (primary.provider !== 'google' && configured('google')) {
    const configuredGeminiModel = process.env.LEO_CHAT_MODEL?.trim().replace(/^google\//, '');
    const fallbackModel = configuredGeminiModel?.startsWith('gemini-') ? configuredGeminiModel : 'gemini-3.8-flash';
    return `google/${fallbackModel}`;
  }
  if (primary.provider === 'google' && configured('openai')) {
    return 'openai/gpt-4o-mini';
  }
  return undefined;
}

function safeErrorStatus(error: unknown) {
  const status = providerStatus(error);
  return status === null ? undefined : status;
}

function logFallbackEvent(event: string, fields: Record<string, string | number | boolean | undefined>) {
  // Intentionally log metadata only: never include prompts, headers, or secrets.
  console.info(JSON.stringify({ time: new Date().toISOString(), level: 'info', event, ...fields }));
}

export async function generateWithExplicitFallback<T>(
  primaryModel: string,
  fallbackModel: string | undefined,
  generate: (model: string) => Promise<T>,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
) {
  let primaryProvider: ReturnType<typeof resolveModel>['provider'];
  try {
    primaryProvider = resolveModel(primaryModel).provider;
  } catch {
    // Preserve the original error semantics for invalid primary model IDs.
    return { result: await generate(primaryModel), model: primaryModel, fallback_used: false };
  }

  // Do not call an unconfigured primary provider. This is the critical Gemini-only
  // case: route directly to the configured cross-provider fallback.
  const primaryConfigured = configured(primaryProvider);
  if (!primaryConfigured) {
    if (!fallbackModel || fallbackModel === primaryModel) {
      throw new ModelProviderError(`The selected provider (${primaryProvider}) is not configured and no fallback is available. Configure its server-side API key or set LEO_FALLBACK_MODEL.`, 503);
    }
    let resolvedFallback: ReturnType<typeof resolveModel>;
    try { resolvedFallback = resolveModel(fallbackModel); }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a Google AI Studio model ID such as gemini-3.8-flash.', 503); }
    const normalizedFallback = `${resolvedFallback.provider}/${resolvedFallback.model}`;
    const fallbackProvider = resolvedFallback.provider;
    if (fallbackProvider === primaryProvider || !configured(fallbackProvider)) {
      throw new ModelProviderError(`The selected provider (${primaryProvider}) is not configured and the fallback provider (${fallbackProvider}) is unavailable.`, 503);
    }
    logFallbackEvent('leo.ai.fallback.start', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_not_configured' });
    try {
      const result = await generate(normalizedFallback);
      logFallbackEvent('leo.ai.fallback.success', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_not_configured' });
      return { result, model: normalizedFallback, fallback_used: true };
    } catch (error) {
      logFallbackEvent('leo.ai.fallback.failure', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_not_configured', status_code: safeErrorStatus(error), error_type: error instanceof Error ? error.name : 'unknown' });
      throw error;
    }
  }

  try {
    return { result: await generate(primaryModel), model: primaryModel, fallback_used: false };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel || !isRetryableProviderFailure(primaryError)) throw primaryError;
    let resolvedFallback: ReturnType<typeof resolveModel>;
    try { resolvedFallback = resolveModel(fallbackModel); }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a Google AI Studio model ID such as gemini-3.8-flash.', 503); }
    const normalizedFallback = `${resolvedFallback.provider}/${resolvedFallback.model}`;
    const fallbackProvider = resolvedFallback.provider;
    if (fallbackProvider === primaryProvider || !configured(fallbackProvider)) throw primaryError;

    logFallbackEvent('leo.ai.fallback.start', {
      primary_provider: primaryProvider,
      fallback_provider: fallbackProvider,
      reason: 'primary_provider_failed',
      status_code: safeErrorStatus(primaryError),
    });
    try {
      const result = await generate(normalizedFallback);
      logFallbackEvent('leo.ai.fallback.success', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_failed' });
      return { result, model: normalizedFallback, fallback_used: true };
    } catch (fallbackError) {
      logFallbackEvent('leo.ai.fallback.failure', {
        primary_provider: primaryProvider,
        fallback_provider: fallbackProvider,
        reason: 'primary_provider_failed',
        status_code: safeErrorStatus(fallbackError),
        error_type: fallbackError instanceof Error ? fallbackError.name : 'unknown',
      });
      throw fallbackError;
    }
  }
}
