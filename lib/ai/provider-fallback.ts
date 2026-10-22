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
  return status === 408 || status === 409 || status === 429 || status === 404 || (status !== null && status >= 500) || (status === null && isTransientNetworkError(error));
}


export function getSafeFallbackModel(
  primaryModel: string,
  configuredFallback = process.env.LEO_FALLBACK_MODEL?.trim(),
  _customAgent = false,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
): string | undefined {

  // A stale deployment variable must not prevent ordinary chat from working.
  // Prefer a valid, configured explicit fallback; otherwise use Gemini as the
  // cross-provider fallback for any non-Google primary provider.
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
    return 'google/gemini-2.5-flash';
  }
  return undefined;
}

export async function generateWithExplicitFallback<T>(
  primaryModel: string,
  fallbackModel: string | undefined,
  generate: (model: string) => Promise<T>,
  configured: (provider: ReturnType<typeof resolveModel>['provider']) => boolean = isProviderConfigured,
) {
  try {
    return { result: await generate(primaryModel), model: primaryModel, fallback_used: false };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel || !isRetryableProviderFailure(primaryError)) throw primaryError;
    let fallbackProvider: ReturnType<typeof resolveModel>['provider'];
    try { fallbackProvider = resolveModel(fallbackModel).provider; }
    catch { throw new ModelProviderError('The configured fallback model is invalid. Check LEO_FALLBACK_MODEL; use a registered model such as google/gemini-2.5-flash.', 503); }
    if (!configured(fallbackProvider)) throw new ModelProviderError(`The explicitly selected fallback provider (${fallbackProvider}) is not configured.`, 503);
    return { result: await generate(fallbackModel), model: fallbackModel, fallback_used: true };
  }
}