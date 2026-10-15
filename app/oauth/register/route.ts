import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { validateRedirectUri } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid OAuth dynamic client registration request.' }, { status: 400 });
  }
  const name = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 100) : '';
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris = Array.from(new Set(redirects.filter((uri): uri is string => typeof uri === 'string' && uri.length <= 2048)));
  if (!name || !redirectUris.length || redirectUris.length !== redirects.length || redirectUris.length > 10 ||
      redirectUris.some(uri => !validateRedirectUri(uri))) {
    return NextResponse.json({ error: 'Provide a client_name and 1–10 valid HTTPS or loopback redirect URIs.' }, { status: 400 });
  }
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none') {
    return NextResponse.json({ error: 'Only public OAuth clients using PKCE are supported.' }, { status: 400 });
  }
  const clientId = randomUUID();
  const { error } = await adminSupabase().from('mcp_oauth_clients').insert({
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
  });
  if (error) return NextResponse.json({ error: 'OAuth client registration is temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'mcp:read mcp:write',
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
