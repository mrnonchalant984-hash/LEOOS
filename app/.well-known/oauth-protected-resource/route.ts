import { NextRequest, NextResponse } from 'next/server';
import { getMcpBaseUrl, MCP_SCOPES } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getMcpBaseUrl(request);
    return NextResponse.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: [...MCP_SCOPES],
    }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return NextResponse.json({ error: 'OAuth resource metadata is not configured.' }, { status: 503 });
  }
}
