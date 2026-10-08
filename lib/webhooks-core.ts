import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Only events the platform actually emits. Add to this list only when the event is wired to real code.
export const WEBHOOK_EVENTS = ['webhook.test'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const MAX_ATTEMPTS = 6; // first try + 5 retries
const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 21600];

export function generateWebhookSecret() { return 'whsec_' + randomBytes(32).toString('base64url'); }

export function parseEvents(input: unknown): WebhookEvent[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((e): e is WebhookEvent => WEBHOOK_EVENTS.includes(e as WebhookEvent))));
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}
export function signatureHeader(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

/** Verifies a `leo-signature` header. Fails closed on any malformed input or stale timestamp. */
export function verifySignature(secret: string, header: string | null | undefined, body: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, t, body));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Seconds to wait before the next attempt, or null when attempts are exhausted. `attemptsMade` counts tries so far. */
export function nextAttemptDelaySec(attemptsMade: number): number | null {
  return attemptsMade >= MAX_ATTEMPTS ? null : RETRY_DELAYS_SEC[Math.max(0, attemptsMade - 1)];
}

export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  const m4 = v.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export function validateEndpointUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'That is not a valid URL.' }; }
  if (raw.length > 2000) return { ok: false, reason: 'URL is too long.' };
  if (u.protocol !== 'https:') return { ok: false, reason: 'Webhook URLs must use https.' };
  if (u.username || u.password) return { ok: false, reason: 'URLs with embedded credentials are not allowed.' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'Only the default https port is allowed.' };
  const h = u.hostname.toLowerCase();
  if (h.startsWith('[')) return { ok: false, reason: 'IP address hosts are not allowed.' };
  if (!h.includes('.') || h === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(h)) return { ok: false, reason: 'That host is not publicly reachable.' };
  if (/^[\d.]+$/.test(h) && isPrivateIp(h)) return { ok: false, reason: 'Private network addresses are not allowed.' };
  return { ok: true, url: u };
}
