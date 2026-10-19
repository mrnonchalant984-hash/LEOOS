export type DeploymentProvider = 'github' | 'vercel';
export type ProviderFailureCode = 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR' | 'PROVIDER_NETWORK_ERROR';

export class ProviderHttpError extends Error {
  readonly provider: DeploymentProvider;
  readonly status: number;
  readonly code: ProviderFailureCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly providerRequestId: string | null;

  constructor(input: {
    provider: DeploymentProvider;
    status: number;
    code: ProviderFailureCode;
    retryable: boolean;
    retryAfterSeconds?: number | null;
    providerRequestId?: string | null;
  }) {
    const label = input.provider === 'github' ? 'GitHub' : 'Vercel';
    const message = input.code === 'QUOTA_EXHAUSTED'
      ? `${label} has exhausted the configured deployment quota.`
      : input.code === 'RATE_LIMITED'
        ? `${label} temporarily rate-limited this request.`
        : input.code === 'PROVIDER_UNAVAILABLE' || input.code === 'PROVIDER_NETWORK_ERROR'
          ? `${label} is temporarily unavailable.`
          : `${label} rejected this request.`;
    super(message);
    this.name = 'ProviderHttpError';
    this.provider = input.provider;
    this.status = input.status;
    this.code = input.code;
    this.retryable = input.retryable;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.providerRequestId = input.providerRequestId ?? null;
  }
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Math.ceil(Number(trimmed));
    return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - nowMs) / 1000));
}

function providerRetryAfter(headers: Headers, nowMs: number): number | null {
  const retryAfter = parseRetryAfter(headers.get('retry-after'), nowMs);
  if (retryAfter !== null) return retryAfter;
  const reset = headers.get('x-ratelimit-reset');
  if (!reset || !/^\d+(?:\.\d+)?$/.test(reset.trim())) return null;
  const resetSeconds = Number(reset);
  if (!Number.isFinite(resetSeconds)) return null;
  return Math.max(0, Math.ceil(resetSeconds - nowMs / 1000));
}

function safeRequestId(headers: Headers, provider: DeploymentProvider): string | null {
  const candidate = headers.get(provider === 'github' ? 'x-github-request-id' : 'x-vercel-id') || headers.get('x-request-id');
  return candidate && /^[A-Za-z0-9._:-]{1,120}$/.test(candidate) ? candidate : null;
}

function extractCodes(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const root = payload as Record<string, unknown>;
  const nested = root.error && typeof root.error === 'object' && !Array.isArray(root.error)
    ? root.error as Record<string, unknown>
    : {};
  return [root.code, root.errorCode, nested.code, nested.type, root.message, nested.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .slice(0, 1200);
}

function makeProviderError(provider: DeploymentProvider, response: Response, payload: unknown, nowMs: number): ProviderHttpError {
  const clues = extractCodes(payload);
  const retryAfterSeconds = providerRetryAfter(response.headers, nowMs);
  const exhausted = /quota[_ -]?(?:exceeded|exhausted)|monthly[_ -]?limit|billing[_ -]?limit|payment[_ -]?required/.test(clues);
  const githubRateLimit = provider === 'github' && /api rate limit exceeded|secondary rate limit|abuse detection/.test(clues);
  const hasReset = response.headers.get('x-ratelimit-remaining') === '0' && retryAfterSeconds !== null;

  if (exhausted) {
    return new ProviderHttpError({ provider, status: response.status, code: 'QUOTA_EXHAUSTED', retryable: false, retryAfterSeconds, providerRequestId: safeRequestId(response.headers, provider) });
  }
  if (response.status === 429 || githubRateLimit || hasReset) {
    return new ProviderHttpError({ provider, status: response.status, code: 'RATE_LIMITED', retryable: true, retryAfterSeconds, providerRequestId: safeRequestId(response.headers, provider) });
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    return new ProviderHttpError({ provider, status: response.status, code: 'PROVIDER_UNAVAILABLE', retryable: true, retryAfterSeconds, providerRequestId: safeRequestId(response.headers, provider) });
  }
  return new ProviderHttpError({ provider, status: response.status, code: 'PROVIDER_ERROR', retryable: false, providerRequestId: safeRequestId(response.headers, provider) });
}

export type ProviderRequestOptions = {
  maxAttempts?: number;
  retryDeadlineMs?: number;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

function wait(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

function retryDelayMs(error: ProviderHttpError, attempt: number, random: () => number): number {
  if (error.retryAfterSeconds !== null) return error.retryAfterSeconds * 1000;
  const ceiling = Math.min(4000, 500 * (2 ** (attempt - 1)));
  return Math.max(1, Math.round(ceiling * (0.5 + Math.max(0, Math.min(1, random())))));
}

/**
 * Sends a provider request. Only idempotent GETs are retried; POSTs and other
 * writes surface the provider response without an unsafe replay.
 */
export async function requestProviderJson<T = Record<string, unknown>>(
  provider: DeploymentProvider,
  url: string,
  init: RequestInit = {},
  options: ProviderRequestOptions = {},
): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const safeRead = method === 'GET';
  const configuredAttempts = options.maxAttempts ?? 3;
  const maxAttempts = Number.isInteger(configuredAttempts) ? Math.max(1, Math.min(5, configuredAttempts)) : 3;
  const retryDeadlineMs = Math.max(0, Math.min(30_000, options.retryDeadlineMs ?? 8000));
  const fetcher = options.fetcher || fetch;
  const sleep = options.wait || wait;
  const random = options.random || Math.random;
  const now = options.now || Date.now;
  const startedAt = now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, init);
    } catch {
      const networkError = new ProviderHttpError({ provider, status: 0, code: 'PROVIDER_NETWORK_ERROR', retryable: true });
      if (!safeRead || attempt === maxAttempts || now() - startedAt >= retryDeadlineMs) throw networkError;
      const delay = retryDelayMs(networkError, attempt, random);
      if (now() - startedAt + delay > retryDeadlineMs) throw networkError;
      await sleep(delay);
      continue;
    }

    if (response.ok) {
      const raw = await response.text();
      if (!raw) return null as T;
      try { return JSON.parse(raw) as T; } catch { return null as T; }
    }

    const raw = await response.text().catch(() => '');
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* provider text is never returned or logged */ }
    const error = makeProviderError(provider, response, payload, now());
    const transient = error.retryable && error.code !== 'QUOTA_EXHAUSTED';
    if (!safeRead || !transient || attempt === maxAttempts || now() - startedAt >= retryDeadlineMs) throw error;
    const delay = retryDelayMs(error, attempt, random);
    if (now() - startedAt + delay > retryDeadlineMs) throw error;
    await sleep(delay);
  }

  throw new ProviderHttpError({ provider, status: 0, code: 'PROVIDER_NETWORK_ERROR', retryable: true });
}
