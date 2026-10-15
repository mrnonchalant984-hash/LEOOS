import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createOpaqueToken,
  getMcpBaseUrl,
  hashOpaqueToken,
  MCP_ACCESS_TOKEN_SECONDS,
  MCP_REFRESH_TOKEN_SECONDS,
  pkceChallenge,
} from '@/lib/mcp/oauth';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}

function equalVerifier(verifier: string, expectedChallenge: string) {
  const actual = Buffer.from(pkceChallenge(verifier));
  const expected = Buffer.from(expectedChallenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Send OAuth token requests as application/x-www-form-urlencoded.');
  }
  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const grantType = get('grant_type');
  const clientId = get('client_id');
  const requestedResource = get('resource');
  const rawAccessToken = createOpaqueToken();
  const rawRefreshToken = createOpaqueToken();
  const db = adminSupabase();

  if (!clientId) return jsonError('client_id is required.');
  let resourceUrl: string;
  try {
    resourceUrl = `${getMcpBaseUrl(request)}/mcp`;
  } catch {
    return jsonError('MCP OAuth public URL is not configured.', 503);
  }
  if (requestedResource && requestedResource !== resourceUrl) return jsonError('invalid_target');
  const { data: client, error: clientError } = await db.from('mcp_oauth_clients')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (clientError) return jsonError('OAuth client registry is unavailable.', 503);
  if (!client) return jsonError('invalid_client', 401);

  let userId: string;
  let scope: string;
  if (grantType === 'authorization_code') {
    const code = get('code');
    const verifier = get('code_verifier');
    const redirectUri = get('redirect_uri');
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !code || !redirectUri) {
      return jsonError('invalid_grant');
    }
    const { data: authorization, error } = await db.from('mcp_oauth_authorization_codes')
      .select('id,client_id,user_id,redirect_uri,code_challenge,scope,expires_at,consumed_at')
      .eq('code_hash', hashOpaqueToken(code))
      .maybeSingle();
    if (error) return jsonError('Authorization-code storage is unavailable.', 503);
    if (!authorization || authorization.client_id !== clientId ||
        authorization.redirect_uri !== redirectUri ||
        authorization.consumed_at ||
        new Date(authorization.expires_at) <= new Date() ||
        !equalVerifier(verifier, authorization.code_challenge)) {
      return jsonError('invalid_grant');
    }
    const { data: consumed, error: consumeError } = await db.from('mcp_oauth_authorization_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', authorization.id)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (consumeError) return jsonError('Authorization code could not be consumed.', 503);
    if (!consumed) return jsonError('invalid_grant');
    userId = authorization.user_id;
    scope = authorization.scope;
  } else if (grantType === 'refresh_token') {
    const refreshToken = get('refresh_token');
    if (!refreshToken) return jsonError('invalid_grant');
    const { data: current, error } = await db.from('mcp_oauth_tokens')
      .select('id,client_id,user_id,scope,refresh_expires_at,revoked_at')
      .eq('refresh_token_hash', hashOpaqueToken(refreshToken))
      .maybeSingle();
    if (error) return jsonError('Refresh-token storage is unavailable.', 503);
    if (!current || current.client_id !== clientId || current.revoked_at ||
        new Date(current.refresh_expires_at) <= new Date()) return jsonError('invalid_grant');
    const { data: revoked, error: revokeError } = await db.from('mcp_oauth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', current.id)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (revokeError) return jsonError('Refresh token could not be rotated.', 503);
    if (!revoked) return jsonError('invalid_grant');
    userId = current.user_id;
    scope = current.scope;
  } else {
    return jsonError('unsupported_grant_type');
  }

  const now = Date.now();
  const { error: insertError } = await db.from('mcp_oauth_tokens').insert({
    access_token_hash: hashOpaqueToken(rawAccessToken),
    refresh_token_hash: hashOpaqueToken(rawRefreshToken),
    client_id: clientId,
    user_id: userId,
    scope,
    expires_at: new Date(now + MCP_ACCESS_TOKEN_SECONDS * 1000).toISOString(),
    refresh_expires_at: new Date(now + MCP_REFRESH_TOKEN_SECONDS * 1000).toISOString(),
  });
  if (insertError) return jsonError('OAuth token issuance is temporarily unavailable.', 503);
  return NextResponse.json({
    access_token: rawAccessToken,
    token_type: 'Bearer',
    expires_in: MCP_ACCESS_TOKEN_SECONDS,
    refresh_token: rawRefreshToken,
    scope,
  }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}
