import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import type { EnvTarget } from '@/lib/env-config-catalog';
import { submitSecureEnvVariable } from '@/lib/secure-env-config';

export const runtime = 'nodejs';
const MAX_CONFIG_BODY_BYTES = 65_536;

async function readBoundedBody(request: NextRequest): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      bytesRead += value.byteLength;
      if (bytesRead > MAX_CONFIG_BODY_BYTES) {
        await reader.cancel();
        throw new Error('config_body_too_large');
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Secure credential submission path.
 * Browser → authenticated backend → Vercel.
 * Secret values are never returned, logged, or placed in AI/tool responses.
 */
export async function POST(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isPlatformOwner(auth.profile)) {
    return NextResponse.json({ error: 'Owner access required to submit environment credentials.' }, { status: 403 });
  }
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-config-submit', 10, 60);
  if (limited) return limited;

  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Send credentials as JSON over HTTPS.' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_CONFIG_BODY_BYTES) {
    return NextResponse.json({ error: 'Configuration request is too large.' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBoundedBody(request));
  } catch (error) {
    if (error instanceof Error && error.message === 'config_body_too_large') {
      return NextResponse.json({ error: 'Configuration request is too large.' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'Send a valid configuration object.' }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const value = typeof body.value === 'string' ? body.value : '';
  const target = (typeof body.target === 'string' ? body.target : 'production') as EnvTarget;
  const projectId = typeof body.vercelProjectId === 'string' ? body.vercelProjectId.trim() : '';
  const websiteProjectId = typeof body.websiteProjectId === 'string' ? body.websiteProjectId : null;

  // Do not log body, Authorization, or value.
  const result = await submitSecureEnvVariable({
    projectId,
    name,
    value,
    target,
    actorUserId: auth.user.id,
  });

  try {
    await adminSupabase().from('secure_config_audit').insert({
      owner_user_id: auth.user.id,
      website_project_id: websiteProjectId,
      variable_name: name || 'unknown',
      target_env: target,
      result: result.audit.result,
      message: result.message,
    });
  } catch {
    // Audit failure must not echo secrets; continue with the primary result.
  }

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status >= 400 && result.status < 600 ? result.status : 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    metadata: result.metadata,
  }, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
