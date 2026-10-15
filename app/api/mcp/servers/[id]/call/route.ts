import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { decryptMcpCredential } from '@/lib/mcp/outbound-security';
import { callMcpTool } from '@/lib/mcp/remote-clients';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to call an MCP tool.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-tool-call', 20, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid MCP connection ID is required.' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const toolName = typeof body?.tool_name === 'string' ? body.tool_name : '';
  const args = body?.arguments;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(toolName) || !args || typeof args !== 'object' || Array.isArray(args) ||
      Buffer.byteLength(JSON.stringify(args)) > 16 * 1024) {
    return NextResponse.json({ error: 'Provide a valid tool name and an object of arguments no larger than 16 KB.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: server, error: serverError } = await db.from('mcp_remote_servers')
    .select('id,endpoint_url,credential_ciphertext,discovered_tools,enabled')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (serverError) return NextResponse.json({ error: 'The MCP connection could not be checked.' }, { status: 503 });
  if (!server || !server.enabled) return NextResponse.json({ error: 'MCP connection not found or disabled.' }, { status: 404 });
  const tool = (Array.isArray(server.discovered_tools) ? server.discovered_tools : []).find(item => item.name === toolName);
  if (!tool) return NextResponse.json({ error: 'That tool is not available on this connection.' }, { status: 404 });
  const { data: approval, error: approvalError } = await db.from('mcp_remote_tool_approvals')
    .select('tool_name')
    .eq('server_id', id)
    .eq('tool_name', toolName)
    .maybeSingle();
  if (approvalError) return NextResponse.json({ error: 'MCP tool permissions could not be checked.' }, { status: 503 });
  if (!approval) return NextResponse.json({ error: 'Approve this tool before calling it.' }, { status: 403 });
  let bearerToken: string | undefined;
  try {
    bearerToken = server.credential_ciphertext ? decryptMcpCredential(server.credential_ciphertext) : undefined;
  } catch {
    return NextResponse.json({ error: 'The stored MCP credential could not be decrypted. Update the credential-encryption key or reconnect the server.' }, { status: 503 });
  }

  const startedAt = Date.now();
  const requestId = request.headers.get('x-request-id') || randomUUID();
  let result: { isError: boolean; text: string };
  try {
    result = await callMcpTool(server.endpoint_url, bearerToken, toolName, args as Record<string, unknown>);
  } catch {
    const { error } = await db.from('mcp_tool_audit').insert({
      user_id: ctx.user.id,
      server_id: id,
      tool_name: toolName,
      outcome: 'error',
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    });
    if (error) return NextResponse.json({ error: 'The remote tool call failed and its audit record could not be saved. Check the remote server before retrying.' }, { status: 503 });
    return NextResponse.json({ error: 'The remote MCP tool call failed. No arguments or credentials were logged.' }, { status: 502 });
  }
  const { error: auditError } = await db.from('mcp_tool_audit').insert({
    user_id: ctx.user.id,
    server_id: id,
    tool_name: toolName,
    outcome: result.isError ? 'error' : 'success',
    duration_ms: Date.now() - startedAt,
    request_id: requestId,
  });
  if (auditError) return NextResponse.json({ error: 'The tool returned, but its audit record could not be saved. Check the remote server before retrying.' }, { status: 503 });
  return NextResponse.json({ tool_name: toolName, is_error: result.isError, result: result.text }, { headers: { 'Cache-Control': 'private, no-store', 'X-Request-ID': requestId } });
}
