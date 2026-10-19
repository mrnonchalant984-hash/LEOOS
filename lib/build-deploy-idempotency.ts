import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(stableValue);
    if (items.every(item => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as JsonRecord).path === 'string')) {
      return items.sort((a, b) => String((a as JsonRecord).path).localeCompare(String((b as JsonRecord).path)));
    }
    return items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([key]) => key !== 'idempotency_key')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

/** Hash the complete tenant-scoped build request without persisting its contents. */
export function buildDeployRequestHash(userId: string, projectId: string, body: JsonRecord): string {
  const canonical = stableValue({ userId, projectId, body });
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function resolveBuildDeployIdempotencyKey(
  headerKey: string | null,
  bodyKey: unknown,
  requestHash: string,
): { key: string; error?: never } | { key?: never; error: string } {
  if (bodyKey !== undefined && typeof bodyKey !== 'string') {
    return { error: 'The idempotency key must be a string.' };
  }
  const normalizedHeader = headerKey?.trim() || undefined;
  const normalizedBody = typeof bodyKey === 'string' ? bodyKey.trim() || undefined : undefined;
  if (normalizedHeader && normalizedBody && normalizedHeader !== normalizedBody) {
    return { error: 'The body and header idempotency keys must match.' };
  }
  const candidate = normalizedHeader || normalizedBody;
  if (!candidate) return { key: requestHash };
  if (candidate.length < 8 || candidate.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate)) {
    return { error: 'The idempotency key must be 8–120 safe letters, digits, dots, underscores, colons, or hyphens.' };
  }
  return { key: candidate };
}

/** Server-only knob; invalid values fall back to the protected default. */
export function getBuildDeployRateLimitPerHour(value = process.env.LEO_BUILD_DEPLOY_LIMIT_PER_HOUR): number {
  if (!value || !/^\d{1,3}$/.test(value)) return 3;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 100 ? parsed : 3;
}
