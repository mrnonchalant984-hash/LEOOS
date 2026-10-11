import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_BODY_BYTES = 32_000;
const REQUEST_TIMEOUT_MS = 8_000;

type PluginRequest = {
  protocol?: unknown;
  plugin_id?: unknown;
  version?: unknown;
  action?: unknown;
  input?: unknown;
  request_id?: unknown;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function validSignature(rawBody: string, supplied: string | null, secret: string | undefined) {
  if (!supplied || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(supplied.trim(), 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

function apiOrigin() {
  const value = process.env.LEO_API_URL?.trim() || 'https://leoos-omega.vercel.app';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function readLeonardX(path: string) {
  const apiKey = process.env.LEO_API_KEY?.trim();
  const origin = apiOrigin();
  if (!apiKey || !origin) return { response: json({ error: { code: 'WORKER_NOT_CONFIGURED', message: 'Plugin service is not configured.' } }, 503) };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { response: json({ error: { code: 'LEONARDX_API_ERROR', message: 'LeonardX could not complete the plugin request.' } }, 502) };
    const normalizedData = body && typeof body === 'object' && 'data' in body
      ? (body as { data: unknown }).data
      : body;
    return { data: normalizedData };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { response: json({ error: { code: timedOut ? 'LEONARDX_API_TIMEOUT' : 'LEONARDX_API_UNAVAILABLE', message: 'LeonardX could not be reached.' } }, 504) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Plugin request is too large.' } }, 413);
  if (!validSignature(rawBody, request.headers.get('X-LEO-Signature'), process.env.PLUGIN_RUNTIME_TOKEN)) return json({ error: { code: 'UNAUTHORIZED', message: 'Plugin signature is invalid.' } }, 401);

  let body: PluginRequest;
  try {
    body = JSON.parse(rawBody) as PluginRequest;
  } catch {
    return json({ error: { code: 'INVALID_JSON', message: 'Plugin request must be valid JSON.' } }, 400);
  }
  if (body.protocol !== 'leo-plugin-v1' || body.plugin_id !== 'leo-project-reader' || body.version !== '1.0.0' || typeof body.request_id !== 'string') {
    return json({ error: { code: 'INVALID_REQUEST', message: 'Unsupported plugin request.' } }, 400);
  }

  if (body.action === 'projects.list') {
    const result = await readLeonardX('/api/v1/projects');
    if ('response' in result) return result.response;
    return json({ data: result.data, request_id: body.request_id });
  }

  if (body.action === 'projects.read') {
    const input = body.input && typeof body.input === 'object' ? body.input as Record<string, unknown> : {};
    const projectId = typeof input.project_id === 'string' && /^[0-9a-f-]{20,}$/i.test(input.project_id) ? input.project_id : '';
    if (!projectId) return json({ error: { code: 'VALIDATION_ERROR', message: 'input.project_id is required.' } }, 400);
    const result = await readLeonardX(`/api/v1/projects/${encodeURIComponent(projectId)}`);
    if ('response' in result) return result.response;
    return json({ data: result.data, request_id: body.request_id });
  }

  if (body.action === 'webhooks.list') {
    const result = await readLeonardX('/api/v2/webhooks');
    if ('response' in result) return result.response;
    return json({ data: result.data, request_id: body.request_id });
  }

  if (body.action === 'webhooks.read') {
    const input = body.input && typeof body.input === 'object' ? body.input as Record<string, unknown> : {};
    const webhookId = typeof input.webhook_id === 'string' && /^[0-9a-f-]{20,}$/i.test(input.webhook_id) ? input.webhook_id : '';
    if (!webhookId) return json({ error: { code: 'VALIDATION_ERROR', message: 'input.webhook_id is required.' } }, 400);
    const result = await readLeonardX(`/api/v2/webhooks/${encodeURIComponent(webhookId)}`);
    if ('response' in result) return result.response;
    return json({ data: result.data, request_id: body.request_id });
  }

  return json({ error: { code: 'UNSUPPORTED_ACTION', message: 'This plugin action is not supported.' } }, 400);
}
