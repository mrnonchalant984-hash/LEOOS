import { createHmac, timingSafeEqual } from 'node:crypto';

export type Project = { id: string; project_name: string; type: string | null; status: string | null; progress: number | null; file_url?: string | null; created_at: string };
export type ApiResponse<T> = { data: T; request_id: string; meta?: Record<string, unknown> };
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class LeoApiError extends Error {
  readonly status: number; readonly code: string; readonly requestId?: string;
  constructor(status: number, code: string, message: string, requestId?: string) { super(message); this.name = 'LeoApiError'; this.status = status; this.code = code; this.requestId = requestId; }
}
export class LeoRateLimitError extends LeoApiError {
  readonly retryAfterSeconds: number | null;
  constructor(status: number, message: string, requestId: string | undefined, retryAfterSeconds: number | null) { super(status, 'rate_limited', message, requestId); this.name = 'LeoRateLimitError'; this.retryAfterSeconds = retryAfterSeconds; }
}

type Options = { apiKey: string; baseUrl?: string; fetch?: FetchLike };
export class LeoClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  public readonly projects = {
    list: (params?: { limit?: number; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit !== undefined) query.set('limit', String(Math.min(Math.max(params.limit, 1), 100)));
      if (params?.status) query.set('status', params.status);
      return this.request<ApiResponse<Project[]>>(`/api/v1/projects${query.size ? `?${query}` : ''}`);
    },
    create: (input: { project_name: string; type?: string }) => this.request<ApiResponse<Project>>('/api/v2/projects', { method: 'POST', body: JSON.stringify(input) }),
  };
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
    if (!options?.apiKey || typeof options.apiKey !== 'string') throw new TypeError('apiKey is required');
    this.baseUrl = (options.baseUrl || '').replace(/\/$/, '');
    this.fetcher = options.fetch || fetch;
  }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    headers.authorization = `Bearer ${this.options.apiKey}`;
    headers['content-type'] = 'application/json';
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    const requestId = response.headers.get('x-request-id') || undefined;
    let body: any = null;
    try { body = await response.json(); } catch { /* preserve the HTTP error */ }
    if (!response.ok) {
      const error = body?.error || {};
      const code = String(error.code || 'api_error');
      const message = String(error.message || `LEO OS API error (${response.status})`);
      const retry = Number(response.headers.get('retry-after'));
      if (response.status === 429) throw new LeoRateLimitError(response.status, message, requestId || error.request_id, Number.isFinite(retry) ? retry : null);
      throw new LeoApiError(response.status, code, message, requestId || error.request_id);
    }
    return body as T;
  }
}
export class LeoOS extends LeoClient {}

export function verifyWebhookSignature(secret: string, header: string | undefined, rawBody: string, options: { toleranceSeconds?: number; nowSeconds?: number } = {}) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(part => { const index = part.indexOf('='); return index > 0 ? [part.slice(0, index).trim(), part.slice(index + 1).trim()] : ['', '']; }));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'));
  const received = Buffer.from(parts.v1);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
