import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getMcpBaseUrl, isAllowedMcpOrigin, MCP_SCOPE, validateMcpAccessToken } from '@/lib/mcp/oauth';
import { handleUserMcpRequest } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
    'Access-Control-Expose-Headers': 'MCP-Session-Id, WWW-Authenticate',
    'Vary': 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function unauthorized(request: NextRequest) {
  let resourceMetadata = '';
  try {
    resourceMetadata = `${getMcpBaseUrl(request)}/.well-known/oauth-protected-resource`;
  } catch {
    resourceMetadata = new URL('/.well-known/oauth-protected-resource', request.url).toString();
  }
  return NextResponse.json({ error: 'A valid OAuth access token is required.' }, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${resourceMetadata}", scope="${MCP_SCOPE}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedMcpOrigin(request.headers.get('origin'), request.url)) {
    return NextResponse.json({ error: 'The request origin is not allowed.' }, { status: 403 });
  }
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    return NextResponse.json({ error: 'Streamable HTTP clients must accept application/json and text/event-stream.' }, { status: 406 });
  }
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,256})$/i.exec(authorization);
  if (!match) return unauthorized(request);
  try {
    const token = await validateMcpAccessToken(match[1]);
    if (!token) return unauthorized(request);
    const db = adminSupabase();
    const projects = {
      async listProjects(userId: string, limit: number) {
        const { data, error } = await db.from('projects')
          .select('id,project_name,type,status,progress,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        return { data, error };
      },
      async getProject(userId: string, projectId: string) {
        const { data, error } = await db.from('projects')
          .select('id,project_name,type,status,progress,created_at')
          .eq('id', projectId)
          .eq('user_id', userId)
          .maybeSingle();
        return { data, error };
      },
    };
    const response = await handleUserMcpRequest(request, token.userId, projects);
    const headers = new Headers(response.headers);
    for (const [key, value] of corsHeaders(request)) headers.set(key, value);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error('MCP request failed:', error instanceof Error ? error.message : 'Unknown MCP error');
    return NextResponse.json({ error: 'The MCP request could not be completed.' }, { status: 503, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  if (!isAllowedMcpOrigin(request.headers.get('origin'), request.url)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}
