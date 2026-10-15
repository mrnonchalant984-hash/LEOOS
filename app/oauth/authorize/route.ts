import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getMcpBaseUrl, MCP_READ_SCOPE, MCP_WRITE_SCOPE, parseMcpScopes, validateRedirectUri } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const clientId = query.get('client_id') || '';
  const redirectUri = query.get('redirect_uri') || '';
  const responseType = query.get('response_type');
  const challenge = query.get('code_challenge') || '';
  const challengeMethod = query.get('code_challenge_method');
  const state = query.get('state') || '';
  const requestedScope = query.get('scope')?.trim() || MCP_READ_SCOPE;
  const scopes = parseMcpScopes(requestedScope);
  let baseUrl: string;
  try {
    baseUrl = getMcpBaseUrl(request);
  } catch {
    return NextResponse.json({ error: 'OAuth authorization is not configured.' }, { status: 503 });
  }
  const requestedResource = query.get('resource');
  if (requestedResource && requestedResource !== `${baseUrl}/mcp`) {
    return NextResponse.json({ error: 'The requested resource does not match this MCP server.' }, { status: 400 });
  }
  if (responseType !== 'code' || challengeMethod !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
      state.length > 512 || !scopes || !validateRedirectUri(redirectUri)) {
    return NextResponse.json({ error: `Invalid OAuth authorization request. Authorization code flow with PKCE S256 and ${MCP_READ_SCOPE} are required; ${MCP_WRITE_SCOPE} is optional.` }, { status: 400 });
  }

  const db = adminSupabase();
  const { data: client, error: clientError } = await db.from('mcp_oauth_clients')
    .select('client_id,redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle();
  if (clientError) return NextResponse.json({ error: 'OAuth client registry is unavailable.' }, { status: 503 });
  if (!client || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: 'The OAuth client or redirect URI is not registered.' }, { status: 400 });
  }

  const { data: pending, error: insertError } = await db.from('mcp_oauth_authorization_requests')
    .insert({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      scope: scopes.join(' '),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (insertError || !pending) return NextResponse.json({ error: 'The authorization request could not be saved.' }, { status: 503 });
  const consentUrl = new URL('/mcp/authorize', baseUrl);
  consentUrl.searchParams.set('request_id', pending.id);
  return NextResponse.redirect(consentUrl, 302);
}
