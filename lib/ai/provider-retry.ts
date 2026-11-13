type RetryOptions = {
  signal?: AbortSignal;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as { status?: unknown; statusCode?: unknown };
  const status = typeof value.status === 'number' ? value.status : value.statusCode;
  return typeof status === 'number' ? status : null;
}

function retryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const headers = (error as { headers?: unknown }).headers;
  let value: string | null = null;
  if (headers && typeof headers === 'object' && 'get' in headers && typeof headers.get === 'function') {
    value = headers.get('retry-after') ?? headers.get('Retry-After');
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    const raw = record['retry-after'] ?? record['Retry-After'];
    if (typeof raw === 'string' || typeof raw === 'number') value = String(raw);
  }
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 30_000)) : null;
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Request aborted'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Request aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Retries only transient provider throttling/server failures, never client errors. */
export async function retryProviderRequest<T>(request: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.min(4, Math.trunc(options.maxAttempts ?? 3)));
  const base = Math.max(50, Math.min(5_000, Math.trunc(options.baseDelayMs ?? 400)));
  const cap = Math.max(base, Math.min(30_000, Math.trunc(options.maxDelayMs ?? 4_000)));
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('Request aborted');
    try {
      return await request();
    } catch (error) {
      const status = statusOf(error);
      const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt >= attempts || options.signal?.aborted) throw error;
      const exponential = Math.min(cap, base * (2 ** (attempt - 1)));
      const jittered = Math.round(exponential * (0.5 + Math.max(0, Math.min(1, random()))));
      // Retry-After is an explicit provider instruction; honour it up to the
      // parser's 30-second safety bound rather than shortening it to our backoff cap.
      const delay = retryAfterMs(error) ?? jittered;
      await sleep(delay, options.signal);
    }
  }
}
