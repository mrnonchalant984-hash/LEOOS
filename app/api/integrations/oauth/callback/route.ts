import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { sealConnectionConfig, verifyCustomerConnection, type CustomerProvider, type CustomerConnectionConfig } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';
function redirect(request: NextRequest, status: string, provider = '') {
  const target = new URL('/integrations', request.nextUrl.origin);
  target.searchParams.set('oauth', status); if (provider) target.searchParams.set('provider', provider);
  return NextResponse.redirect(target, { status: 303 });
}
async function tokenRequest(url: string, body: URLSearchParams, headers: Record<string, string> = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers }, body: body.toString(), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof result.access_token !== 'string') throw new Error('OAuth token exchange failed.');
  return result;
}
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code'); const state = request.nextUrl.searchParams.get('state');
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) return redirect(request, 'denied');
  if (!code || !state || state.length > 300) return redirect(request, 'invalid_state');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const db = adminSupabase();
  const { data: stateRow, error: readError } = await db.from('integration_oauth_states').select('*').eq('state_hash', stateHash).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (readError || !stateRow) return redirect(request, 'invalid_or_expired_state');
  // Consume state before exchanging the code to prevent replay and concurrent callback races.
  const { data: consumed } = await db.from('integration_oauth_states').update({ used_at: new Date().toISOString() }).eq('id', stateRow.id).is('used_at', null).select('id').maybeSingle();
  if (!consumed) return redirect(request, 'state_already_used', stateRow.provider);
  const provider = stateRow.provider as CustomerProvider;
  const callback = process.env.INTEGRATION_OAUTH_CALLBACK_URL || new URL('/api/integrations/oauth/callback', request.nextUrl.origin).toString();
  try {
    let config: CustomerConnectionConfig = {};
    if (provider === 'github') {
      const result = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: callback }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const json = await result.json() as Record<string, unknown>; if (!result.ok || typeof json.access_token !== 'string') throw new Error('GitHub token exchange failed.');
      config = { token: json.access_token, token_type: String(json.token_type || 'bearer'), scope: String(json.scope || '') };
    } else if (provider === 'vercel') {
      const json = await tokenRequest('https://api.vercel.com/v2/oauth/access_token', new URLSearchParams({ client_id: process.env.VERCEL_OAUTH_CLIENT_ID || '', client_secret: process.env.VERCEL_OAUTH_CLIENT_SECRET || '', code, redirect_uri: callback }));
      config = { token: String(json.access_token), token_type: String(json.token_type || 'bearer') };
    } else if (provider === 'meta' || provider === 'whatsapp_business') {
      const exchangeUrl = new URL(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/oauth/access_token`); exchangeUrl.search = new URLSearchParams({ client_id: process.env.META_APP_ID || '', client_secret: process.env.META_APP_SECRET || '', redirect_uri: callback, code }).toString(); const exchangeResponse = await fetch(exchangeUrl, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }); const json = await exchangeResponse.json() as Record<string, unknown>; if (!exchangeResponse.ok || typeof json.access_token !== 'string') throw new Error('Meta token exchange failed.');
      let accessToken = String(json.access_token);
      try { const params = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID || '', client_secret: process.env.META_APP_SECRET || '', fb_exchange_token: accessToken }); const longLived = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/oauth/access_token?${params}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) }); const longJson = await longLived.json() as Record<string, unknown>; if (longLived.ok && typeof longJson.access_token === 'string') accessToken = longJson.access_token; } catch { /* reconnect if the short-lived token expires */ }
      config = { access_token: accessToken, token_type: String(json.token_type || 'bearer') };
    } else {
      const json = await tokenRequest('https://oauth2.googleapis.com/token', new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '', client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '', redirect_uri: callback, grant_type: 'authorization_code', code }));
      config = { access_token: String(json.access_token), token_type: String(json.token_type || 'Bearer'), refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : '', expires_at: String(Date.now() + Number(json.expires_in || 3600) * 1000), scope: String(json.scope || '') };
    }
    if ((provider === 'firebase' || provider === 'youtube') && !config.refresh_token) {
      const { data: previous } = await db.from('user_integrations').select('credential_ciphertext').eq('user_id', stateRow.user_id).eq('provider', provider).eq('label', stateRow.label).maybeSingle();
      if (previous?.credential_ciphertext) { try { const { openConnectionConfig } = await import('@/lib/integrations/customer-connections'); const prior = openConnectionConfig(previous.credential_ciphertext); if (prior.refresh_token) config.refresh_token = prior.refresh_token; } catch { /* replace unusable old credentials with the new grant */ } }
    }
    const verification = await verifyCustomerConnection(provider, config);
    const ciphertext = sealConnectionConfig(config);
    const { error } = await db.from('user_integrations').upsert({ user_id: stateRow.user_id, provider, label: stateRow.label, credential_ciphertext: ciphertext, status: verification.status, scopes: config.scope ? config.scope.split(/[ ,]+/).filter(Boolean) : [], metadata: { auth_method: 'oauth' }, last_verified_at: verification.status === 'verified' ? new Date().toISOString() : null, last_error_code: verification.code || null }, { onConflict: 'user_id,provider,label' });
    if (error) throw new Error('The authorized account could not be saved.');
    return redirect(request, verification.status === 'verified' ? 'connected' : 'connected_needs_verification', provider);
  } catch {
    return redirect(request, 'exchange_failed', provider);
  }
}
