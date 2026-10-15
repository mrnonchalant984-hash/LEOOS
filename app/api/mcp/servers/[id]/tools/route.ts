import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to manage MCP tool permissions.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-server-write', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid MCP connection ID is required.' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const toolName = typeof body?.tool_name === 'string' ? body.tool_name : '';
  const approved = body?.approved;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(toolName) || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'Provide a discovered tool name and an explicit approval decision.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: server, error: serverError } = await db.from('mcp_remote_servers')
    .select('id,discovered_tools')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (serverError) return NextResponse.json({ error: 'The MCP connection could not be checked.' }, { status: 503 });
  if (!server) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });
  const tools = Array.isArray(server.discovered_tools) ? server.discovered_tools : [];
  if (!tools.some(tool => tool.name === toolName)) return NextResponse.json({ error: 'That tool was not discovered on this connection.' }, { status: 404 });
  if (approved) {
    const { error } = await db.from('mcp_remote_tool_approvals')
      .upsert({ server_id: id, tool_name: toolName }, { onConflict: 'server_id,tool_name' });
    if (error) return NextResponse.json({ error: 'The MCP tool permission could not be saved.' }, { status: 503 });
  } else {
    const { error } = await db.from('mcp_remote_tool_approvals')
      .delete()
      .eq('server_id', id)
      .eq('tool_name', toolName);
    if (error) return NextResponse.json({ error: 'The MCP tool permission could not be revoked.' }, { status: 503 });
  }
  return NextResponse.json({ server_id: id, tool_name: toolName, approved }, { headers: { 'Cache-Control': 'no-store' } });
}
