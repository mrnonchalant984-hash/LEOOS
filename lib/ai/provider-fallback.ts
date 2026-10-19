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
  return status === 429 || (status !== null && status >= 500) || (status === null && isTransientNetworkError(error));
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
    catch { throw new ModelProviderError('The explicitly selected fallback model is not supported.', 400); }
    if (!configured(fallbackProvider)) throw new ModelProviderError(`The explicitly selected fallback provider (${fallbackProvider}) is not configured.`, 503);
    return { result: await generate(fallbackModel), model: fallbackModel, fallback_used: true };
  }
}