import { getModelProviderStatus, isProviderConfigured, ModelProviderError, resolveModel } from './model-catalog.ts';

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

function isRetryableFallbackFailure(error: unknown) {
  const status = providerStatus(error);
  return status === 408 || status === 409 || status === 429 ||
    (status !== null && status >= 500) ||
    (status === null && isTransientNetworkError(error));
}


export function getSafeFallbackModel(
  primaryModel: string,
  configuredFallback = process.env.LEO_FALLBACK_MODEL?.trim(),
  _customAgent = false,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
  requiredCapability?: string,
): string | undefined {
  const primary = resolveModel(primaryModel);
  const isCompatible = (fallback: ReturnType<typeof resolveModel>) => {
    const entry = getModelProviderStatus().find(model =>
      model.provider === fallback.provider && model.model === fallback.model,
    );
    return !requiredCapability || Boolean(entry?.capabilities.includes(requiredCapability));
  };
  if (configuredFallback) {
    try {
      const fallback = resolveModel(configuredFallback);
      const isCatalogued = getModelProviderStatus().some(model => model.provider === fallback.provider && model.model === fallback.model);
      if (fallback.provider === 'google' && isCatalogued && isCompatible(fallback) &&
          `${fallback.provider}/${fallback.model}` !== `${primary.provider}/${primary.model}` && configured('google')) {
        return `${fallback.provider}/${fallback.model}`;
      }
    } catch {
      // Ignore stale fallback configuration and use the Gemini policy below.
    }
  }

  if (!configured('google')) return undefined;
  const fallbackModel = requiredCapability === 'reasoning'
    ? primary.model === 'gemini-4-argon' ? 'gemini-3.1-pro-preview' : 'gemini-4-argon'
    : primary.model === 'gemini-3.8-flash' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash';
  return `google/${fallbackModel}`;
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
  options: {
    maxFallbackAttempts?: number;
    shouldFallbackOnError?: (error: unknown) => boolean;
  } = {},
) {
  // resolveModel throws for unknown, retired, or non-Gemini IDs. Never bypass
  // that validation by forwarding an unchecked model identifier to the callback.
  const primary = resolveModel(primaryModel);
  const primaryProvider = primary.provider;
  const normalizedPrimary = `${primary.provider}/${primary.model}`;
  const primaryConfigured = configured(primaryProvider);
  const maxFallbackAttempts = Math.max(0, Math.min(2, Math.trunc(options.maxFallbackAttempts ?? 1)));
  const shouldFallbackOnError = options.shouldFallbackOnError || (() => true);
  if (!primaryConfigured) {
    if (!fallbackModel || fallbackModel === primaryModel || maxFallbackAttempts === 0) {
      throw new ModelProviderError(`The selected provider (${primaryProvider}) is not configured and no fallback is available. Configure its server-side API key or set LEO_FALLBACK_MODEL.`, 503);
    }
    let resolvedFallback: ReturnType<typeof resolveModel>;
    try { resolvedFallback = resolveModel(fallbackModel); }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a Google AI Studio model ID such as gemini-3.8-flash.', 503); }
    const normalizedFallback = `${resolvedFallback.provider}/${resolvedFallback.model}`;
    const fallbackProvider = resolvedFallback.provider;
    if (normalizedFallback === normalizedPrimary || !configured(fallbackProvider)) {
      throw new ModelProviderError(`The selected provider (${primaryProvider}) is not configured and the fallback provider (${fallbackProvider}) is unavailable.`, 503);
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxFallbackAttempts; attempt += 1) {
      logFallbackEvent('leo.ai.fallback.start', {
        primary_provider: primaryProvider,
        fallback_provider: fallbackProvider,
        reason: 'primary_provider_not_configured',
        attempt,
      });
      try {
        const result = await generate(normalizedFallback);
        logFallbackEvent('leo.ai.fallback.success', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_not_configured', attempt });
        return { result, model: normalizedFallback, fallback_used: true };
      } catch (error) {
        lastError = error;
        logFallbackEvent('leo.ai.fallback.failure', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_not_configured', attempt, status_code: safeErrorStatus(error), error_type: error instanceof Error ? error.name : 'unknown' });
        if (attempt >= maxFallbackAttempts || !isRetryableFallbackFailure(error) || !shouldFallbackOnError(error)) throw error;
      }
    }
    throw lastError;
  }

  // Automatic recovery is limited to a different configured Gemini model.

  try {
    return { result: await generate(primaryModel), model: primaryModel, fallback_used: false };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel || maxFallbackAttempts === 0 ||
        !isRetryableProviderFailure(primaryError) || !shouldFallbackOnError(primaryError)) throw primaryError;
    let resolvedFallback: ReturnType<typeof resolveModel>;
    try { resolvedFallback = resolveModel(fallbackModel); }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a Google AI Studio model ID such as gemini-3.8-flash.', 503); }
    const normalizedFallback = `${resolvedFallback.provider}/${resolvedFallback.model}`;
    const fallbackProvider = resolvedFallback.provider;
    if (normalizedFallback === normalizedPrimary || !configured(fallbackProvider)) throw primaryError;

    let lastError: unknown = primaryError;
    for (let attempt = 1; attempt <= maxFallbackAttempts; attempt += 1) {
      logFallbackEvent('leo.ai.fallback.start', {
        primary_provider: primaryProvider,
        fallback_provider: fallbackProvider,
        reason: 'primary_provider_failed',
        attempt,
        status_code: safeErrorStatus(lastError),
      });
      try {
        const result = await generate(normalizedFallback);
        logFallbackEvent('leo.ai.fallback.success', { primary_provider: primaryProvider, fallback_provider: fallbackProvider, reason: 'primary_provider_failed', attempt });
        return { result, model: normalizedFallback, fallback_used: true };
      } catch (fallbackError) {
        lastError = fallbackError;
        logFallbackEvent('leo.ai.fallback.failure', {
          primary_provider: primaryProvider,
          fallback_provider: fallbackProvider,
          reason: 'primary_provider_failed',
          attempt,
          status_code: safeErrorStatus(fallbackError),
          error_type: fallbackError instanceof Error ? fallbackError.name : 'unknown',
        });
        if (attempt >= maxFallbackAttempts || !isRetryableFallbackFailure(fallbackError) || !shouldFallbackOnError(fallbackError)) throw fallbackError;
      }
    }
    throw lastError;
  }
}
