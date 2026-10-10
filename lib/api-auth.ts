import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { hashSecret } from '@/lib/api-security';
import { hasScope, type ApiScope } from '@/lib/api-keys-core';

export type ApiContext = { userId: string; keyId: string; scopes: string[]; requestId: string };

const fail = (requestId: string, code: string, message: string, status: number, retryAfter?: number) => {
  const headers: Record<string, string> = { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' };
  if (retryAfter) headers['Retry-After'] = String(retryAfter);
  return { error: NextResponse.json({ error: { code, message }, request_id: requestId }, { status, headers }) };
};

export async function authenticateApiKey(req: NextRequest, requiredScope: ApiScope = 'read'): Promise<ApiContext | { error: NextResponse }> {
  const suppliedRequestId = req.headers.get('X-Request-ID')?.trim();
  const requestId = suppliedRequestId && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^leo_[A-Za-z0-9_-]{20,160}$/.test(token)) return fail(requestId, 'UNAUTHORIZED', 'A valid LEO API key is required.', 401);
  const db = adminSupabase();
  const { data, error } = await db.from('api_keys').select('id,user_id,scopes,revoked,expires_at').eq('key_hash', hashSecret(token)).maybeSingle();
  if (error || !data || data.revoked || (data.expires_at && new Date(data.expires_at) <= new Date())) return fail(requestId, 'INVALID_API_KEY', 'The API key is invalid, revoked or expired.', 401);
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((s): s is string => typeof s === 'string') : [];
  if (requiredScope && !hasScope(scopes, requiredScope)) return fail(requestId, 'INSUFFICIENT_SCOPE', `The key requires the ${requiredScope} scope.`, 403);

  // Distributed rate limiting is enforced by a Postgres function, not process memory.
  const { data: rl, error: rlError } = await db.rpc('consume_api_rate_limit', { p_key_id: data.id, p_limit: 120, p_window_seconds: 60 });
  if (rlError) return fail(requestId, 'RATE_LIMIT_UNAVAILABLE', 'API rate limiting is temporarily unavailable.', 503, 5);
  if (rl === false) return fail(requestId, 'RATE_LIMITED', 'API rate limit exceeded. Try again later.', 429, 60);

  await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { userId: data.user_id, keyId: data.id, scopes, requestId };
}

export async function recordApiRequest(ctx: ApiContext, req: NextRequest, statusCode: number, startedAt: number) {
  const db = adminSupabase();
  const route = new URL(req.url).pathname.replace(/\/projects\/[A-Za-z0-9_-]+(?=\/|$)/g, '/projects/:id');
  await db.from('api_request_logs').insert({ key_id: ctx.keyId, user_id: ctx.userId, request_id: ctx.requestId, method: req.method, route, status_code: statusCode, latency_ms: Math.max(0, Date.now() - startedAt) });
}

/** Runs an API-key route and records its actual HTTP outcome without letting logging failure break the request. */
export async function withApiKey(
  req: NextRequest,
  requiredScope: ApiScope,
  handler: (context: ApiContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  const context = await authenticateApiKey(req, requiredScope);
  if ('error' in context) return context.error;

  let response: NextResponse;
  try {
    response = await handler(context);
  } catch {
    response = apiResponse({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
      request_id: context.requestId,
    }, 500, context.requestId);
  }

  try { await recordApiRequest(context, req, response.status, startedAt); } catch { /* telemetry must not break API availability */ }
  return response;
}

export function apiResponse(body: unknown, status = 200, requestId?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (requestId) headers.set('X-Request-ID', requestId);
  return NextResponse.json(body, { status, headers });
}
