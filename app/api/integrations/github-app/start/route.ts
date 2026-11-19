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
  const requestedReturnTo = typeof body.return_to === 'string' ? body.return_to : '';
  const returnTo = requestedReturnTo === '/app' ? '/app' : '/integrations';
  const state = randomBytes(32).toString('base64url');
  const { error } = await adminSupabase().from('integration_oauth_states').insert({
    state_hash: createHash('sha256').update(state).digest('hex'),
    user_id: ctx.user.id,
    provider: 'github',
    label,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    metadata: { auth_method: 'github_app_installation', return_to: returnTo },
  });
  if (error) return NextResponse.json({ error: 'Could not create a secure GitHub installation state. Apply the integration OAuth migrations and retry.' }, { status: 503 });

  const authorizationUrl = new URL(`https://github.com/apps/${slug}/installations/new`);
  authorizationUrl.searchParams.set('state', state);
  return NextResponse.json({ authorizationUrl: authorizationUrl.toString(), provider: 'github', authMethod: 'github_app', expiresInSeconds: 600 }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
