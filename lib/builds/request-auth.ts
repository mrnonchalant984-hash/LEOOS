import { NextRequest } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { validateMcpAccessToken } from '@/lib/mcp/oauth';

type BuildScope = 'mcp:read' | 'mcp:write';

/** Resolve either a regular LeonardX session or a scoped MCP actor for build APIs. */
export async function getBuildActor(req: NextRequest, requiredScope: BuildScope) {
  const authorization = req.headers.get('authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,256})$/i.exec(authorization);
  if (match) {
    const token = await validateMcpAccessToken(match[1]);
    if (token) {
      if (!token.scopes.includes(requiredScope)) return null;
      const { data: profile } = await adminSupabase().from('profiles').select('*').eq('id', token.userId).maybeSingle();
      return profile ? { user: { id: token.userId }, profile } : null;
    }
  }
  return getProfile(req);
}
