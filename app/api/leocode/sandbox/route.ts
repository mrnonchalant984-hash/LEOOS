import { createHmac, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceLeoCodeDailyQuota } from '@/lib/leocode-entitlement';
import { enforceIpRateLimit, enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const OPERATIONS = new Set(['inspect', 'apply_patch', 'install', 'test', 'typecheck', 'lint', 'build']);
const WORKSPACE_ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function trustedRequestOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin) return origin === req.nextUrl.origin;
  return /^Bearer\s+\S+$/i.test(req.headers.get('authorization') || '');
}

function getRunnerUrl() {
  const configured = process.env.LEO_SANDBOX_URL?.trim();
  if (!configured) throw new Error('sandbox_not_configured');
  const url = new URL(configured);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash
    || url.pathname !== '/') {
    throw new Error('sandbox_url_invalid');
  }
  return url.origin;
}

function validateInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['operation', 'workspaceId', 'workspaceZipBase64', 'patch', 'confirmChanges'].includes(key))) return null;
  if (typeof input.operation !== 'string' || !OPERATIONS.has(input.operation)) return null;
  if (input.workspaceId !== undefined && (typeof input.workspaceId !== 'string' || !WORKSPACE_ID_RE.test(input.workspaceId))) return null;
  if (input.workspaceId !== undefined && input.workspaceZipBase64 !== undefined) return null;
  if (input.workspaceZipBase64 !== undefined) {
    if (typeof input.workspaceZipBase64 !== 'string' || input.workspaceZipBase64.length > Math.ceil(MAX_ARCHIVE_BYTES * 4 / 3) + 8
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.workspaceZipBase64)) return null;
    if (Buffer.from(input.workspaceZipBase64, 'base64').length > MAX_ARCHIVE_BYTES) return null;
  }
  if (input.workspaceId === undefined && input.workspaceZipBase64 === undefined) return null;
  if (input.patch !== undefined && (typeof input.patch !== 'string' || input.patch.length > 128_000)) return null;
  if (input.operation === 'apply_patch' && (input.confirmChanges !== true || typeof input.patch !== 'string' || !input.patch)) return null;
  return input;
}

export async function POST(req: NextRequest) {
  if (!trustedRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Sign in to use the isolated execution service.' }, { status: 401 });
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES * 1.5 + 64_000) {
    return NextResponse.json({ error: 'The sandbox request exceeds its size limit.' }, { status: 413 });
  }

  const body: unknown = await req.json().catch(() => null);
  const input = validateInput(body);
  if (!input) return NextResponse.json({
    error: 'Choose a supported sandbox operation and provide a workspace archive or your existing workspace ID. Applying a patch requires explicit confirmation.',
  }, { status: 400 });

  const secret = process.env.LEO_SANDBOX_HMAC_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'The isolated execution service is not configured.' }, { status: 503 });

  let baseUrl: string;
  try {
    baseUrl = getRunnerUrl();
  } catch {
    return NextResponse.json({ error: 'The isolated execution service URL is missing or invalid.' }, { status: 503 });
  }

  try {
    const quota = await enforceLeoCodeDailyQuota(context.user.id);
    if (!quota.entitlement) return NextResponse.json({ error: 'Active LeoCode Founders access is required for sandbox execution.' }, { status: 403 });
    if (quota.response) return quota.response;
  } catch (error) {
    console.error('LeoCode sandbox entitlement check failed', {
      userId: context.user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Sandbox access could not be verified.' }, { status: 503 });
  }

  const userLimited = await enforceUserRateLimit(context.user.id, 'leocode-sandbox', 5, 3600);
  if (userLimited) return userLimited;
  const ipLimited = await enforceIpRateLimit(req, 'leocode-sandbox-ip', 20, 3600);
  if (ipLimited) return ipLimited;

  const payload = {
    job_id: randomUUID(),
    tenant_id: context.user.id,
    operation: input.operation,
    ...(typeof input.workspaceId === 'string' ? { workspace_id: input.workspaceId } : {}),
    ...(typeof input.workspaceZipBase64 === 'string' ? { workspace_zip_base64: input.workspaceZipBase64 } : {}),
    ...(typeof input.patch === 'string' ? { patch: input.patch } : {}),
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  try {
    const response = await fetch(`${baseUrl}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Runner-Timestamp': timestamp,
        'X-Runner-Signature': signature,
      },
      body: rawBody,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(280_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object') {
      console.error('LeoCode sandbox service returned an error', { status: response.status, userId: context.user.id });
      return NextResponse.json({ error: 'The isolated execution service could not complete the request.' }, {
        status: response.status >= 400 && response.status < 500 ? response.status : 502,
      });
    }
    return NextResponse.json({
      jobId: typeof result.job_id === 'string' ? result.job_id : payload.job_id,
      workspaceId: typeof result.workspace_id === 'string' ? result.workspace_id : null,
      ok: result.ok === true,
      exitCode: typeof result.exit_code === 'number' ? result.exit_code : null,
      stdout: typeof result.stdout === 'string' ? result.stdout.slice(-24_000) : '',
      stderr: typeof result.stderr === 'string' ? result.stderr.slice(-12_000) : '',
      workspaceArchiveBase64: typeof result.workspace_zip_base64 === 'string' ? result.workspace_zip_base64 : null,
      workspaceArtifactOmitted: result.workspace_artifact_omitted === true,
      isolation: { runtime: 'gVisor runsc', network: 'disabled', tenantIsolation: 'enforced' },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('LeoCode sandbox request failed', {
      jobId: payload.job_id,
      userId: context.user.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'The isolated execution service is unavailable or timed out.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!trustedRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Sign in to manage isolated workspaces.' }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Provide a valid workspace ID.' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.workspaceId !== 'string'
    || !WORKSPACE_ID_RE.test(input.workspaceId)) {
    return NextResponse.json({ error: 'Provide a valid workspace ID.' }, { status: 400 });
  }
  const workspaceId = input.workspaceId;
  const secret = process.env.LEO_SANDBOX_HMAC_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'The isolated execution service is not configured.' }, { status: 503 });

  let baseUrl: string;
  try {
    baseUrl = getRunnerUrl();
  } catch {
    return NextResponse.json({ error: 'The isolated execution service URL is missing or invalid.' }, { status: 503 });
  }

  const userLimited = await enforceUserRateLimit(context.user.id, 'leocode-sandbox-delete', 10, 3600);
  if (userLimited) return userLimited;
  const ipLimited = await enforceIpRateLimit(req, 'leocode-sandbox-delete-ip', 30, 3600);
  if (ipLimited) return ipLimited;

  const payload = { tenant_id: context.user.id };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  try {
    const response = await fetch(`${baseUrl}/v1/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Runner-Timestamp': timestamp,
        'X-Runner-Signature': signature,
      },
      body: rawBody,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object' || result.deleted !== true) {
      console.error('LeoCode sandbox workspace deletion failed', {
        status: response.status,
        userId: context.user.id,
      });
      return NextResponse.json({ error: 'The isolated workspace could not be deleted.' }, {
        status: response.status >= 400 && response.status < 500 ? response.status : 502,
      });
    }
    return NextResponse.json({ deleted: true, workspaceId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('LeoCode sandbox workspace deletion request failed', {
      userId: context.user.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'The isolated execution service is unavailable.' }, { status: 503 });
  }
}
