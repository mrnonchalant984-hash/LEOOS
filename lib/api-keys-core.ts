import { createHash, randomBytes } from 'node:crypto';

export const API_SCOPES = ['read', 'write', 'projects:read', 'projects:write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const KEY_PREFIX = 'leo_live_';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey() {
  const raw = KEY_PREFIX + randomBytes(32).toString('base64url');
  return { raw, prefix: raw.slice(0, KEY_PREFIX.length + 4), hash: hashApiKey(raw) };
}

export function parseScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((s): s is ApiScope => API_SCOPES.includes(s as ApiScope))));
}

export function hasScope(granted: string[] | null | undefined, needed: ApiScope): boolean {
  if (!Array.isArray(granted)) return false;
  if (granted.includes('*') || granted.includes(needed)) return true;
  if (needed === 'read') return granted.includes('write') || granted.includes('projects:read') || granted.includes('projects:write');
  if (needed === 'projects:read') return granted.includes('read') || granted.includes('write') || granted.includes('projects:write');
  return false;
}

export function keyState(k: { revoked_at?: string | null; expires_at?: string | null }, now = new Date()) {
  if (k.revoked_at) return 'revoked' as const;
  if (k.expires_at && new Date(k.expires_at) <= now) return 'expired' as const;
  return 'active' as const;
}
