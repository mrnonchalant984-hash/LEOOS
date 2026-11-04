import { createHash, randomBytes } from 'node:crypto';

export function normalizeInvitationCode(input: unknown) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^LEOCODE-EARLY-[A-F0-9]{16}$/.test(code) ? code : null;
}

export function hashInvitationCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function createInvitationCode() {
  const code = `LEOCODE-EARLY-${randomBytes(8).toString('hex').toUpperCase()}`;
  return { code, codeHash: hashInvitationCode(code) };
}

export function validateInvitationBatch(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const count = Number(body.count);
  const maxRedemptions = Number(body.maxRedemptions);
  const expiresAt = typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null;
  if (!Number.isInteger(count) || count < 1 || count > 100) return null;
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000) return null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;
  return { count, maxRedemptions, expiresAt: expiresAt.toISOString() };
}
