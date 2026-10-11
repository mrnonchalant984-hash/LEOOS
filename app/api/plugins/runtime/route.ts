import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_INPUT_BYTES = 32_000;
const MAX_OUTPUT_BYTES = 64_000;
const PLUGIN_TIMEOUT_MS = 10_000;

const ACTION_PERMISSIONS: Record<string, string> = {
  'projects.list': 'projects:read',
  'projects.read': 'projects:read',
  'webhooks.list': 'webhooks:read',
  'webhooks.read': 'webhooks:read',
  'projects.create': 'projects:write',
  'projects.update': 'projects:write',
};

function json(body: unknown, status = 200, requestId?: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
    },
  });
}

function tokenMatches(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const received = Buffer.from(supplied);
  const configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}

function isSafeEntrypoint(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443');
  } catch {
    return false;
  }
}

function hasPermission(manifest: Record<string, unknown>, action: string) {
  const required = ACTION_PERMISSIONS[action];
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  return Boolean(required && permissions.includes(required));
}

async function recordExecution(id: string, values: Record<string, unknown>) {
  try {
    await adminSupabase().from('plugin_executions').update(values).eq('id', id);
  } catch {
    // Execution outcome must not be changed by telemetry persistence failure.
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('X-Request-ID')?.trim() || randomUUID();
  if (!tokenMatches(req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || null, process.env.PLUGIN_RUNTIME_TOKEN)) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Plugin runtime authentication failed.' }, request_id: requestId }, 401, requestId);
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) {
    return json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Plugin input is too large.' }, request_id: requestId }, 413, requestId);
  }

  let body: { plugin_id?: unknown; version?: unknown; action?: unknown; input?: unknown };
  try {
    body = JSON.parse(raw || '{}') as { plugin_id?: unknown; version?: unknown; action?: unknown; input?: unknown };
  } catch {
    return json({ error: { code: 'INVALID_JSON', message: 'Plugin request body must be valid JSON.' }, request_id: requestId }, 400, requestId);
  }
  const pluginId = typeof body.plugin_id === 'string' ? body.plugin_id : '';
  const version = typeof body.version === 'string' ? body.version : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(pluginId) || !/^\d+\.\d+\.\d+$/.test(version) || !ACTION_PERMISSIONS[action]) {
    return json({ error: { code: 'INVALID_REQUEST', message: 'A valid plugin, version, and supported action are required.' }, request_id: requestId }, 400, requestId);
  }

  const db = adminSupabase();
  const { data: record, error: lookupError } = await db.from('plugin_manifests')
    .select('plugin_id,version,manifest,status')
    .eq('plugin_id', pluginId)
    .eq('version', version)
    .eq('status', 'enabled')
    .maybeSingle();
  if (lookupError) return json({ error: { code: 'REGISTRY_UNAVAILABLE', message: 'Plugin registry is unavailable.' }, request_id: requestId }, 503, requestId);
  const manifest = record?.manifest as Record<string, unknown> | undefined;
  const entrypoint = manifest?.entrypoint;
  if (!record || !manifest || !hasPermission(manifest, action) || !isSafeEntrypoint(entrypoint)) {
    return json({ error: { code: 'PLUGIN_UNAVAILABLE', message: 'The enabled plugin or requested permission was not found.' }, request_id: requestId }, 404, requestId);
  }

  const execution = await db.from('plugin_executions').insert({ plugin_id: pluginId, version, action, request_id: requestId, status: 'started' }).select('id').single();
  if (execution.error || !execution.data) return json({ error: { code: 'EXECUTION_LOG_UNAVAILABLE', message: 'Plugin execution could not be started.' }, request_id: requestId }, 503, requestId);

  const startedAt = Date.now();
  const payload = JSON.stringify({ protocol: 'leo-plugin-v1', plugin_id: pluginId, version, action, input: body.input ?? null, request_id: requestId });
  const signature = createHmac('sha256', process.env.PLUGIN_RUNTIME_TOKEN || '').update(payload).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLUGIN_TIMEOUT_MS);
  try {
    const response = await fetch(entrypoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LEO-Plugin-ID': pluginId, 'X-LEO-Plugin-Version': version, 'X-LEO-Request-ID': requestId, 'X-LEO-Signature': signature },
      body: payload,
      signal: controller.signal,
    });
    const output = await response.text();
    const duration = Date.now() - startedAt;
    if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
      await recordExecution(execution.data.id, { status: 'failed', response_status: response.status, duration_ms: duration, error_code: 'OUTPUT_TOO_LARGE', completed_at: new Date().toISOString() });
      return json({ error: { code: 'PLUGIN_OUTPUT_TOO_LARGE', message: 'Plugin response exceeded the allowed size.' }, request_id: requestId }, 502, requestId);
    }
    await recordExecution(execution.data.id, { status: response.ok ? 'succeeded' : 'failed', response_status: response.status, duration_ms: duration, error_code: response.ok ? null : 'PLUGIN_RESPONSE_ERROR', completed_at: new Date().toISOString() });
    if (!response.ok) return json({ error: { code: 'PLUGIN_RESPONSE_ERROR', message: 'The plugin returned an error.' }, request_id: requestId }, 502, requestId);
    let data: unknown = null;
    try { data = output ? JSON.parse(output) : null; } catch { data = { text: output }; }
    const normalizedData = data && typeof data === 'object' && 'data' in data
      ? (data as { data: unknown }).data
      : data;
    return json({ data: normalizedData, request_id: requestId }, 200, requestId);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    await recordExecution(execution.data.id, { status: timedOut ? 'timed_out' : 'failed', duration_ms: Date.now() - startedAt, error_code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', completed_at: new Date().toISOString() });
    return json({ error: { code: timedOut ? 'PLUGIN_TIMEOUT' : 'PLUGIN_UNAVAILABLE', message: timedOut ? 'Plugin execution timed out.' : 'Plugin endpoint could not be reached.' }, request_id: requestId }, 504, requestId);
  } finally {
    clearTimeout(timeout);
  }
}
