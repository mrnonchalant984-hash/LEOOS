import { NextRequest, NextResponse } from 'next/server';
import { getMcpBaseUrl, MCP_SCOPE } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getMcpBaseUrl(request);
    return NextResponse.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [MCP_SCOPE],
    }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return NextResponse.json({ error: 'OAuth authorization-server metadata is not configured.' }, { status: 503 });
  }
}
