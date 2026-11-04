import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { decryptMcpCredential } from '@/lib/mcp/outbound-security';
import { discoverMcpTools, type DiscoveredMcpTool } from '@/lib/mcp/remote-clients';
import { mcpToolsNeedingReapproval } from '@/lib/mcp/tool-diff';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to refresh MCP discovery.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-server-write', 5, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid MCP connection ID is required.' }, { status: 400 });

  const db = adminSupabase();
  const { data: server, error: serverError } = await db.from('mcp_remote_servers')
    .select('id,endpoint_url,credential_ciphertext,discovered_tools')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (serverError) return NextResponse.json({ error: 'The MCP connection could not be checked.' }, { status: 503 });
  if (!server) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });

  let credential: string | undefined;
  let discovered: DiscoveredMcpTool[];
  try {
    credential = server.credential_ciphertext ? decryptMcpCredential(server.credential_ciphertext) : undefined;
  } catch {
    return NextResponse.json({ error: 'The stored MCP credential could not be decrypted. Update the encryption key or reconnect this server. Existing tools and approvals were left unchanged.' }, { status: 503 });
  }
  try {
    discovered = await discoverMcpTools(server.endpoint_url, credential);
  } catch {
    return NextResponse.json({ error: 'Remote MCP discovery failed. Check the endpoint, credentials, and operator allowlist. Existing tools and approvals were left unchanged.' }, { status: 502 });
  }

  const previous = Array.isArray(server.discovered_tools) ? server.discovered_tools : [];
  const changedNames = new Set(mcpToolsNeedingReapproval(previous, discovered));
  const currentNames = new Set(discovered.map(tool => tool.name));
  const { data: approvals, error: approvalError } = await db.from('mcp_remote_tool_approvals')
    .select('tool_name')
    .eq('server_id', id);
  if (approvalError) return NextResponse.json({ error: 'Existing tool permissions could not be checked. Discovery was not saved.' }, { status: 503 });
  const revokeNames = (approvals || [])
    .map(approval => approval.tool_name)
    .filter(name => !currentNames.has(name) || changedNames.has(name));
  if (revokeNames.length) {
    const { error: revokeError } = await db.from('mcp_remote_tool_approvals')
      .delete()
      .eq('server_id', id)
      .in('tool_name', revokeNames);
    if (revokeError) return NextResponse.json({ error: 'Changed tool permissions could not be revoked. Discovery was not saved.' }, { status: 503 });
  }

  const { data: updated, error: updateError } = await db.from('mcp_remote_servers')
    .update({ discovered_tools: discovered, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('id,updated_at')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'The refreshed tool list could not be saved.' }, { status: 503 });
  if (!updated) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });

  return NextResponse.json({
    server_id: id,
    discovered_count: discovered.length,
    approvals_revoked: revokeNames.length,
    updated_at: updated.updated_at,
    message: revokeNames.length
      ? `Discovery refreshed. ${revokeNames.length} changed or removed tool approval(s) were revoked.`
      : 'Discovery refreshed. Existing unchanged tool approvals were preserved; new tools remain unapproved.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
