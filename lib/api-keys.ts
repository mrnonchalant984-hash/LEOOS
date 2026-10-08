import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { hashApiKey, hasScope, keyState, KEY_PREFIX, type ApiScope } from '@/lib/api-keys-core';

export const RATE_LIMIT_PER_MINUTE = 60;

export function apiError(status: number, code: string, message: string, requestId: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message, request_id: requestId } }, { status, headers: { 'x-request-id': requestId, ...headers } });
}

/** Authenticates a Bearer API key, checks revocation/expiry/scope and a per-key rate limit. */
export async function authenticateApiKey(req: NextRequest, scope: ApiScope) {
  const requestId = randomUUID();
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!raw.startsWith(KEY_PREFIX)) return { error: apiError(401, 'invalid_api_key', 'Missing or invalid API key.', requestId) };

  const db = adminSupabase();
  const { data: key } = await db.from('api_keys').select('id,user_id,scopes,expires_at,revoked_at').eq('key_hash', hashApiKey(raw)).maybeSingle();
  if (!key) return { error: apiError(401, 'invalid_api_key', 'Missing or invalid API key.', requestId) };

  const state = keyState(key);
  if (state !== 'active') return { error: apiError(401, `api_key_${state}`, `This API key is ${state}.`, requestId) };
  if (!hasScope(key.scopes, scope)) return { error: apiError(403, 'insufficient_scope', `This key lacks the "${scope}" scope.`, requestId) };

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from('api_usage').select('id', { count: 'exact', head: true }).eq('key_id', key.id).gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { error: apiError(429, 'rate_limited', 'Too many requests. Try again in a minute.', requestId, { 'retry-after': '60' }) };
  }

  const path = new URL(req.url).pathname;
  await db.from('api_usage').insert({ key_id: key.id, user_id: key.user_id, path, status: 200 });
  await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  return { userId: key.user_id as string, requestId };
}
