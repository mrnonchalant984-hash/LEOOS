import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in before installing the Braverton GitHub App.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'github-app-install-start', 5, 60);
  if (limited) return limited;

  const slug = process.env.GITHUB_APP_SLUG?.trim();
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!slug || !appId || !privateKey) {
    return NextResponse.json({ error: 'The Braverton GitHub App is not configured yet. Set GITHUB_APP_SLUG, GITHUB_APP_ID, and GITHUB_APP_PRIVATE_KEY.' }, { status: 503 });
  }
  if (!/^[a-z0-9-]{1,100}$/i.test(slug) || !/^\d{1,20}$/.test(appId) || !privateKey.includes('PRIVATE KEY-----')) {
    return NextResponse.json({ error: 'The Braverton GitHub App configuration is invalid.' }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, 100)
    : 'Braverton GitHub App';
  const continuation = body.continuation && typeof body.continuation === 'object' && !Array.isArray(body.continuation)
    ? body.continuation as Record<string, unknown> : {};
  const sessionId = typeof continuation.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(continuation.session_id) ? continuation.session_id : null;
  const resumeMessage = typeof continuation.message === 'string' ? continuation.message.trim().slice(0, 20000) : '';
  const safeContinuation = sessionId && resumeMessage ? {
    session_id: sessionId, message: resumeMessage,
    ...(typeof continuation.project_id === 'string' && /^[0-9a-f-]{36}$/i.test(continuation.project_id) ? { project_id: continuation.project_id } : {}),
    ...(continuation.request_type === 'repair' ? { request_type: 'repair' } : {}),
    ...(continuation.work_mode === true ? { work_mode: true } : {}),
    ...(continuation.mode === 'normal' || continuation.mode === 'deep' || continuation.mode === 'tools' ? { mode: continuation.mode } : {}),
    ...(typeof continuation.tool_name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(continuation.tool_name) ? { tool_name: continuation.tool_name } : {}),
  } : {};
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const db = adminSupabase();
  const { error } = await db.from('integration_oauth_states').insert({
    state_hash: stateHash, user_id: ctx.user.id, provider: 'github', label,
    expires_at: expiresAt, metadata: { auth_method: 'github_app_installation' },
  });
  if (error) return NextResponse.json({ error: 'Could not create a secure GitHub installation state. Apply the integration OAuth migrations and retry.' }, { status: 503 });
  if (Object.keys(safeContinuation).length) {
    const { error: resumeError } = await db.from('bram_oauth_resumptions').insert({
      user_id: ctx.user.id, provider: 'github', state_hash: stateHash,
      session_id: sessionId, request_id: typeof continuation.request_id === 'string' && /^[0-9a-f-]{36}$/i.test(continuation.request_id) ? continuation.request_id : null,
      continuation: safeContinuation, status: 'pending', expires_at: expiresAt,
    });
    if (resumeError) {
      await db.from('integration_oauth_states').delete().eq('state_hash', stateHash).eq('user_id', ctx.user.id);
      return NextResponse.json({ error: 'The OAuth continuation could not be saved. Retry without interrupting the current chat request.' }, { status: 503 });
    }
  }

  const authorizationUrl = new URL(`https://github.com/apps/${slug}/installations/new`);
  authorizationUrl.searchParams.set('state', state);
  return NextResponse.json({ authorizationUrl: authorizationUrl.toString(), provider: 'github', authMethod: 'github_app', expiresInSeconds: 600 }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
