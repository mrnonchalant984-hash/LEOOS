import { NextRequest, NextResponse } from 'next/server';
import { createOpaqueToken, getMcpBaseUrl, hashOpaqueToken, MCP_ACCESS_TOKEN_SECONDS } from '@/lib/mcp/oauth';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) return NextResponse.json({ error: 'The consent request origin is invalid.' }, { status: 403 });
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to review this MCP connection.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const requestId = typeof body?.request_id === 'string' ? body.request_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || typeof body?.approved !== 'boolean') {
    return NextResponse.json({ error: 'A valid authorization decision is required.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: pending, error } = await db.from('mcp_oauth_authorization_requests')
    .select('id,client_id,redirect_uri,state,code_challenge,scope,expires_at,completed_at')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'The authorization request could not be checked.' }, { status: 503 });
  if (!pending || pending.completed_at || new Date(pending.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'The authorization request is invalid or expired.' }, { status: 404 });
  }
  const { data: claimed, error: claimError } = await db.from('mcp_oauth_authorization_requests')
    .update({ completed_at: new Date().toISOString(), user_id: ctx.user.id })
    .eq('id', requestId)
    .is('completed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: 'The authorization decision could not be saved.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ error: 'This authorization request has already been handled.' }, { status: 409 });

  const destination = new URL(pending.redirect_uri);
  destination.searchParams.set('state', pending.state);
  if (!body.approved) {
    destination.searchParams.set('error', 'access_denied');
    destination.searchParams.set('error_description', 'The LeonardX account owner denied MCP access.');
    return NextResponse.json({ redirect_url: destination.toString() });
  }

  const rawCode = createOpaqueToken();
  const { error: codeError } = await db.from('mcp_oauth_authorization_codes').insert({
    code_hash: hashOpaqueToken(rawCode),
    client_id: pending.client_id,
    user_id: ctx.user.id,
    redirect_uri: pending.redirect_uri,
    code_challenge: pending.code_challenge,
    scope: pending.scope,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  });
  if (codeError) return NextResponse.json({ error: 'The authorization code could not be issued.' }, { status: 503 });
  destination.searchParams.set('code', rawCode);
  try {
    getMcpBaseUrl(request);
  } catch {
    return NextResponse.json({ error: 'MCP OAuth public URL is not configured.' }, { status: 503 });
  }
  return NextResponse.json({ redirect_url: destination.toString() }, { headers: { 'Cache-Control': 'no-store' } });
}
