import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const providers = ['github', 'vercel', 'firebase', 'youtube', 'meta', 'whatsapp_business'] as const;
type OAuthProvider = typeof providers[number];
const scopes: Record<OAuthProvider, string[]> = {
  github: ['read:user', 'user:email', 'repo'],
  vercel: ['openid', 'email', 'profile'],
  firebase: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  youtube: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
  meta: ['public_profile', 'pages_show_list', 'pages_read_engagement', 'read_insights'],
  whatsapp_business: ['public_profile', 'business_management', 'whatsapp_business_management', 'whatsapp_business_messaging'],
};
function callbackUrl(request: NextRequest) {
  const configured = process.env.INTEGRATION_OAUTH_CALLBACK_URL;
  if (configured) return new URL(configured).toString();
  return new URL('/api/integrations/oauth/callback', request.nextUrl.origin).toString();
}
export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in before connecting an account.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'integration-oauth-start', 10, 60);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!providers.includes(body?.provider)) return NextResponse.json({ error: 'OAuth is not available for this provider.' }, { status: 400 });
  const provider = body.provider as OAuthProvider;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 100) : `My ${provider}`;
  const redirectUri = callbackUrl(request);
  if (process.env.NODE_ENV === 'production' && !process.env.INTEGRATION_OAUTH_CALLBACK_URL) return NextResponse.json({ error: 'Set INTEGRATION_OAUTH_CALLBACK_URL to the exact registered HTTPS callback URL before enabling OAuth in production.' }, { status: 503 });
  if (process.env.NODE_ENV === 'production' && !redirectUri.startsWith('https://')) return NextResponse.json({ error: 'Production OAuth callbacks must use HTTPS.' }, { status: 503 });
  const clientId = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_ID : provider === 'vercel' ? process.env.VERCEL_OAUTH_CLIENT_ID : provider === 'meta' || provider === 'whatsapp_business' ? process.env.META_APP_ID : process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_SECRET : provider === 'vercel' ? process.env.VERCEL_OAUTH_CLIENT_SECRET : provider === 'meta' || provider === 'whatsapp_business' ? process.env.META_APP_SECRET : process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: `Missing OAuth client ID or secret for ${provider}.` }, { status: 503 });
  const state = randomBytes(32).toString('base64url');
  const { error } = await adminSupabase().from('integration_oauth_states').insert({
    state_hash: createHash('sha256').update(state).digest('hex'), user_id: ctx.user.id,
    provider, label, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return NextResponse.json({ error: 'OAuth state storage is unavailable. Apply the integration OAuth migration and retry.' }, { status: 503 });
  const url = new URL(provider === 'github' ? 'https://github.com/login/oauth/authorize' : provider === 'vercel' ? 'https://vercel.com/oauth/authorize' : provider === 'meta' || provider === 'whatsapp_business' ? `https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/dialog/oauth` : 'https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (provider === 'github') url.searchParams.set('scope', scopes[provider].join(' '));
  else if (provider === 'vercel') url.searchParams.set('scope', scopes[provider].join(' '));
  else if (provider === 'meta' || provider === 'whatsapp_business') {
    url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', scopes[provider].join(','));
  } else {
    url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', scopes[provider].join(' '));
    url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  }
  return NextResponse.json({ authorizationUrl: url.toString(), provider, expiresInSeconds: 600 }, { headers: { 'Cache-Control': 'no-store' } });
}
