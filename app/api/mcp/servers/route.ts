import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { encryptMcpCredential, validateMcpEndpointUrl } from '@/lib/mcp/outbound-security';
import { discoverMcpTools } from '@/lib/mcp/remote-clients';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to manage MCP connections.' }, { status: 401 });
  const { data: servers, error } = await adminSupabase().from('mcp_remote_servers')
    .select('id,name,endpoint_url,discovered_tools,enabled,created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'MCP connections could not be loaded.' }, { status: 503 });
  const ids = (servers || []).map(server => server.id);
  const { data: approvals, error: approvalError } = ids.length
    ? await adminSupabase().from('mcp_remote_tool_approvals').select('server_id,tool_name,approved_at').in('server_id', ids)
    : { data: [], error: null };
  if (approvalError) return NextResponse.json({ error: 'MCP tool permissions could not be loaded.' }, { status: 503 });
  const safeServers = (servers || []).map(server => ({
    id: server.id,
    name: server.name,
    endpoint_url: server.endpoint_url,
    enabled: server.enabled,
    created_at: server.created_at,
    tools: (Array.isArray(server.discovered_tools) ? server.discovered_tools : []).map(tool => ({
      ...tool,
      approved: (approvals || []).some(approval => approval.server_id === server.id && approval.tool_name === tool.name),
    })),
  }));
  return NextResponse.json({ servers: safeServers }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to add an MCP connection.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-server-write', 5, 60);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const endpoint = typeof body?.endpoint_url === 'string' ? body.endpoint_url.trim() : '';
  const bearerToken = typeof body?.bearer_token === 'string' ? body.bearer_token : '';
  if (!name || !endpoint || (body?.bearer_token !== undefined && (typeof body.bearer_token !== 'string' || bearerToken.length > 8192))) {
    return NextResponse.json({ error: 'Provide a connection name, HTTPS endpoint, and optional bearer credential.' }, { status: 400 });
  }
  try {
    validateMcpEndpointUrl(endpoint);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The MCP endpoint is not allowed.' }, { status: 400 });
  }
  let credentialCiphertext: string | null = null;
  if (bearerToken) {
    try {
      credentialCiphertext = encryptMcpCredential(bearerToken);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'MCP credential encryption is not configured.' }, { status: 503 });
    }
  }

  let tools;
  try {
    tools = await discoverMcpTools(endpoint, bearerToken || undefined);
  } catch {
    return NextResponse.json({ error: 'The MCP server could not be contacted or returned an invalid tool list. Check the endpoint, credentials, and operator allowlist.' }, { status: 502 });
  }
  const db = adminSupabase();
  const { data, error } = await db.from('mcp_remote_servers').insert({
    user_id: ctx.user.id,
    name,
    endpoint_url: endpoint,
    credential_ciphertext: credentialCiphertext,
    discovered_tools: tools,
    enabled: true,
  }).select('id,name,endpoint_url,discovered_tools,enabled,created_at').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A connection with this name already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'The MCP connection could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({
    server: data,
    message: 'Tools were discovered but remain unavailable until you approve each tool.',
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
