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
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mappedDotted = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const mappedHex = value.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
  if (mappedDotted) return isPrivateIp(mappedDotted[1]);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  const ipv4 = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b, c] = ipv4.slice(1).map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2)))
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }

  return value === '::' || value === '::1' || value.startsWith('::')
    || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff')
    || value.startsWith('2001:db8:') || value.startsWith('fec');
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
