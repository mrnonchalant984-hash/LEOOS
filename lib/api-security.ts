import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const KEY_ENV = 'WEBHOOK_ENCRYPTION_KEY';

function encryptionKey() {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new Error(`${KEY_ENV} is required for webhook signing secrets.`);
  const hex = raw.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${KEY_ENV} must be a 64-character hexadecimal AES-256 key.`);
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) throw new Error('Invalid encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function isSafeWebhookUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
    if (/^(10|127)\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    const m = host.match(/^172\.(\d+)\./); if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
    if (/^169\.254\./.test(host) || /^0\./.test(host)) return false;
    return true;
  } catch { return false; }
}
