import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to review this MCP connection.' }, { status: 401 });
  const requestId = request.nextUrl.searchParams.get('request_id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: 'The authorization request is invalid or expired.' }, { status: 400 });
  const db = adminSupabase();
  const { data, error } = await db.from('mcp_oauth_authorization_requests')
    .select('id,client_id,scope,expires_at,completed_at')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'The authorization request could not be checked.' }, { status: 503 });
  if (!data || data.completed_at || new Date(data.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'The authorization request is invalid or expired.' }, { status: 404 });
  }
  const { data: client, error: clientError } = await db.from('mcp_oauth_clients')
    .select('client_name')
    .eq('client_id', data.client_id)
    .maybeSingle();
  if (clientError) return NextResponse.json({ error: 'The MCP client could not be checked.' }, { status: 503 });
  return NextResponse.json({
    request_id: data.id,
    client_name: client?.client_name,
    scope: data.scope,
    account_name: ctx.profile.full_name || ctx.user.email || 'your LeonardX account',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
