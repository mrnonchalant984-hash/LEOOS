import { isProviderConfigured, ModelProviderError, resolveModel } from './model-catalog.ts';

function providerStatus(error: unknown): number | null {
  if (error instanceof ModelProviderError) return error.statusCode;
  if (!error || typeof error !== 'object') return null;
  const value = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const candidate of [value.status, value.statusCode, value.response?.status]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown; error?: { message?: unknown; code?: unknown } };
    return [value.message, value.code, value.error?.message, value.error?.code]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  return String(error ?? '');
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

/**
 * Retry on provider availability failures and exhausted-credit/quota responses.
 * OpenAI-compatible SDKs don't all expose status/code fields in the same place,
 * so explicitly recognize quota text as well as HTTP status values.
 */
export function isRetryableProviderFailure(error: unknown) {
  const status = providerStatus(error);
  const details = errorText(error);
  const quotaOrBillingFailure = /insufficient[_ -]quota|quota (?:is )?(?:exceeded|exhausted)|billing|insufficient credits|credit balance|exceeded your current quota|rate limit/i.test(details);
  if (quotaOrBillingFailure) return true;
  return status === 429 || (status !== null && status >= 500) || (status === null && isTransientNetworkError(error));
}

function isTransientFallbackFailure(error: unknown): boolean {
  const status = providerStatus(error);
  // Keep outer retries narrow: the provider SDK may already retry internally.
  // Only retry temporary gateway/service availability failures, not quota,
  // auth, model-resolution, or malformed-request errors.
  return status === 502 || status === 503 || status === 504 || (status === null && isTransientNetworkError(error));
}

function sanitizedProviderCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as { code?: unknown; error?: { code?: unknown } };
  const candidate = typeof value.code === 'string' ? value.code : value.error?.code;
  return typeof candidate === 'string' && /^[A-Z0-9_.-]{1,48}$/i.test(candidate) ? candidate : undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function getSafeFallbackModel(
  primaryModel: string,
  configuredFallback = process.env.LEO_FALLBACK_MODEL?.trim(),
  customAgent = false,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
): string | undefined {
  if (customAgent) return undefined;

  // A stale deployment variable must not prevent ordinary chat from working.
  // Prefer a valid, configured explicit fallback; otherwise use Gemini only
  // when it is configured and the primary provider is OpenAI.
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

  if (primary.provider === 'openai' && configured('google')) {
    return 'google/gemini-3.8-flash';
  }
  return undefined;
}

export async function generateWithExplicitFallback<T>(
  primaryModel: string,
  fallbackModel: string | undefined,
  generate: (model: string) => Promise<T>,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
  options: { signal?: AbortSignal; maxFallbackRetries?: number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> } = {},
) {
  try {
    return { result: await generate(primaryModel), model: primaryModel, fallback_used: false };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel || !isRetryableProviderFailure(primaryError)) throw primaryError;
    let fallbackProvider: ReturnType<typeof resolveModel>['provider'];
    try { fallbackProvider = resolveModel(fallbackModel).provider; }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a registered model such as google/gemini-3.8-flash.', 503); }
    if (!configured(fallbackProvider)) throw new ModelProviderError(`The explicitly selected fallback provider (${fallbackProvider}) is not configured. Check its server-side API key.`, 503);

    // Emit a provider transition so local/server logs prove whether the fallback
    // was actually attempted. Never log prompts, credentials, or raw SDK errors.
    const fallbackResolved = resolveModel(fallbackModel);
    console.info(JSON.stringify({
      level: 'info',
      event: 'leo.ai.fallback_attempt',
      primary_provider: resolveModel(primaryModel).provider,
      fallback_provider: fallbackResolved.provider,
      fallback_model: fallbackResolved.model,
      reason: providerStatus(primaryError) === 429 ? 'rate_limit_or_quota' : 'provider_failure',
    }));
    let fallbackError: unknown;
    const maxRetries = Math.max(0, Math.min(1, Math.trunc(options.maxFallbackRetries ?? 1)));
    const sleep = options.sleep ?? delay;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (options.signal?.aborted) throw new ModelProviderError('The request was cancelled before the fallback completed.', 499);
      try {
        const result = await generate(fallbackModel);
        console.info(JSON.stringify({
          level: 'info', event: 'leo.ai.fallback_success',
          provider: fallbackResolved.provider, model: fallbackResolved.model,
          attempts: attempt + 1,
        }));
        return { result, model: fallbackModel, fallback_used: true };
      } catch (error) {
        fallbackError = error;
        if (attempt >= maxRetries || !isTransientFallbackFailure(error)) break;
        const waitMs = 300 * (2 ** attempt) + Math.floor(Math.random() * 150);
        console.warn(JSON.stringify({
          level: 'warn', event: 'leo.ai.fallback_retry', provider: fallbackResolved.provider,
          model: fallbackResolved.model, status_code: providerStatus(error),
          attempt: attempt + 1, next_attempt: attempt + 2, delay_ms: waitMs,
        }));
        await sleep(waitMs, options.signal);
      }
    }
    const fallbackStatus = providerStatus(fallbackError);
    const fallbackCategory = fallbackStatus === 401 || fallbackStatus === 403 ? 'authentication_or_access'
      : fallbackStatus === 404 ? 'model_or_endpoint_not_found_or_unavailable'
        : fallbackStatus === 429 ? 'quota_or_rate_limit'
          : fallbackStatus !== null && fallbackStatus >= 500 ? 'provider_server_error'
            : fallbackStatus === 400 ? 'invalid_request_or_model' : 'provider_request_failed';
    // Log only allow-listed status/code/category metadata; never raw SDK messages.
    console.error(JSON.stringify({
      level: 'error', event: 'leo.ai.fallback_failure',
      provider: fallbackResolved.provider, model: fallbackResolved.model,
      status_code: fallbackStatus, provider_error_code: sanitizedProviderCode(fallbackError),
      error_category: fallbackCategory, failure_stage: 'provider_request',
      attempts: Math.min(maxRetries + 1, 2),
      provider_error_hint: fallbackStatus === 503 ? 'temporary_service_unavailable'
        : fallbackStatus === 502 || fallbackStatus === 504 ? 'temporary_gateway_failure'
          : fallbackStatus === 404 ? 'model_or_endpoint_unavailable'
            : fallbackStatus === 401 || fallbackStatus === 403 ? 'check_api_key_and_access'
              : fallbackStatus === 429 ? 'quota_or_rate_limit' : 'request_failed',
    }));
    throw new ModelProviderError(
      `Gemini fallback was attempted but failed (${fallbackCategory}${fallbackStatus ? `, HTTP ${fallbackStatus}` : ''}). ${fallbackStatus === 503 || fallbackStatus === 502 || fallbackStatus === 504 ? 'Google may be temporarily unavailable; retry shortly.' : 'Check the local server log event leo.ai.fallback_failure for sanitized diagnostics.'}`,
      fallbackStatus && fallbackStatus >= 400 && fallbackStatus < 600 ? fallbackStatus : 502,
    );
  }
}