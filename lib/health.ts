import { randomUUID } from 'node:crypto';

function healthRequestId(value: string | null | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : randomUUID();
}

export function createLivenessResponse(requestId?: string | null): Response {
  const id = healthRequestId(requestId);
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-ID': id } },
  );
}
