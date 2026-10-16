import { createHash, randomBytes } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { MCP_DEFAULT_SCOPE, MCP_READ_SCOPE, MCP_SCOPES, parseMcpScopes } from './scopes';
export { MCP_DEFAULT_SCOPE, MCP_READ_SCOPE, MCP_SCOPES, MCP_WRITE_SCOPE, parseMcpScopes, parseRequestedMcpScopes } from './scopes';
export const MCP_SCOPE = MCP_DEFAULT_SCOPE;
export const MCP_ACCESS_TOKEN_SECONDS = 60 * 60;
export const MCP_REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 90;

export function hashOpaqueToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function getMcpBaseUrl(request: Request) {
  const configured = process.env.MCP_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = new URL(configured || new URL(request.url).origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error('MCP_PUBLIC_URL must be an HTTP(S) origin without credentials, query, or fragment.');
  }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('MCP_PUBLIC_URL must use HTTPS in production.');
  }
  return base.origin;
}

export async function validateMcpAccessToken(rawToken: string) {
  if (!rawToken || rawToken.length > 512) return null;
  const db = adminSupabase();
  const { data, error } = await db.from('mcp_oauth_tokens')
    .select('id,user_id,scope,expires_at,revoked_at')
    .eq('access_token_hash', hashOpaqueToken(rawToken))
    .maybeSingle();
  if (error) throw new Error('MCP access-token storage is unavailable.');
  if (!data || data.revoked_at || new Date(data.expires_at) <= new Date()) return null;
  const scopes = parseMcpScopes(String(data.scope || ''));
  if (!scopes) return null;
  const { error: updateError } = await db.from('mcp_oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('revoked_at', null);
  if (updateError) throw new Error('MCP access-token activity could not be recorded.');
  return { userId: data.user_id as string, scope: data.scope as string, scopes };
}

export function validateRedirectUri(value: string) {
  let redirect: URL;
  try {
    redirect = new URL(value);
  } catch {
    return false;
  }
  if (redirect.username || redirect.password || redirect.hash) return false;
  if (redirect.protocol === 'https:') return true;
  if (redirect.protocol !== 'http:') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
}

export function isAllowedMcpOrigin(origin: string | null, requestUrl: string) {
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
  const sameOrigin = parsed.origin === new URL(requestUrl).origin;
  const configured = (process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return sameOrigin || configured.includes(parsed.origin);
}
