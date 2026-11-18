import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { getAccountBuilderAvailability } from '@/lib/builders/account-availability';
import type { ProjectType } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CapabilityStatus = 'available' | 'partial' | 'unavailable' | 'not_connected';
type Capability = { status: CapabilityStatus; detail: string; count?: number; actions?: string[] };

async function countOwned(table: string, userId: string, ownerColumn = 'user_id'): Promise<number | null> {
  try {
    const { count, error } = await adminSupabase().from(table).select('id', { count: 'exact', head: true }).eq(ownerColumn, userId);
    return error ? null : (count || 0);
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const db = adminSupabase();
  const [projects, websites, chats, research, mcp, integrations, builderResults] = await Promise.all([
    countOwned('projects', auth.user.id),
    countOwned('website_projects', auth.user.id, 'owner_user_id'),
    countOwned('chats_v2', auth.user.id),
    countOwned('research_reports', auth.user.id),
    countOwned('mcp_remote_servers', auth.user.id),
    (async () => {
      try {
        const { data, error } = await db.from('user_integrations').select('provider,status,scopes').eq('user_id', auth.user.id).limit(100);
        return error ? null : (data || []);
      } catch { return null; }
    })(),
    Promise.all((['website', 'web_app', 'saas'] as ProjectType[]).map(async type => [type, await getAccountBuilderAvailability(type, auth.user.id)] as const)),
  ]);

  const verified = new Set((integrations || []).filter(row => row.status === 'verified').map(row => row.provider));
  const mcpStatus: CapabilityStatus = mcp === null ? 'unavailable' : mcp > 0 ? 'available' : 'not_connected';
  const githubStatus: CapabilityStatus = integrations === null ? 'unavailable' : verified.has('github') ? 'available' : 'not_connected';
  const vercelStatus: CapabilityStatus = integrations === null ? 'unavailable' : verified.has('vercel') ? 'available' : 'not_connected';
  const builders = Object.fromEntries(builderResults.map(([type, value]) => [type, {
    status: value.status === 'ready' ? 'available' : value.status === 'not_configured' ? 'not_connected' : 'unavailable',
    detail: value.message || (value.status === 'ready' ? 'A build provider is ready for this account.' : 'A compatible build provider is not currently ready.'),
  }]));

  const capabilities: Record<string, Capability> = {
    authentication: { status: 'available', detail: 'This request is authenticated as the signed-in account.' },
    database: { status: 'available', detail: 'Authenticated server-side database access is responding.' },
    profile: { status: 'available', detail: 'The signed-in profile was resolved.' },
    project_workspaces: projects === null ? { status: 'unavailable', detail: 'Project workspace storage could not be checked.' } : { status: 'available', detail: 'Account-owned project workspaces can be queried.', count: projects, actions: ['list', 'create', 'read'] },
    website_projects: websites === null ? { status: 'unavailable', detail: 'Website project storage could not be checked.' } : { status: 'available', detail: 'Account-owned website projects can be queried.', count: websites, actions: ['list', 'create', 'read'] },
    chat_history: chats === null ? { status: 'unavailable', detail: 'Chat history storage could not be checked.' } : { status: 'available', detail: 'Account-owned chat history can be queried.', count: chats, actions: ['read', 'persist'] },
    research_history: research === null ? { status: 'unavailable', detail: 'Research history storage is unavailable; check the research_reports migration.' } : { status: 'available', detail: 'Research reports and their source references are persisted for this account.', count: research, actions: ['search', 'read', 'save'] },
    github: { status: githubStatus, detail: githubStatus === 'available' ? 'A verified GitHub integration is connected.' : githubStatus === 'not_connected' ? 'No verified GitHub integration is connected to this account.' : 'GitHub connection state could not be checked.', actions: githubStatus === 'available' ? ['read', 'write'] : ['connect', 'verify'] },
    vercel: { status: vercelStatus, detail: vercelStatus === 'available' ? 'A verified Vercel integration is connected.' : vercelStatus === 'not_connected' ? 'No verified Vercel integration is connected to this account.' : 'Vercel connection state could not be checked.', actions: vercelStatus === 'available' ? ['read', 'deploy'] : ['connect', 'verify'] },
    mcp: { status: mcpStatus, detail: mcpStatus === 'available' ? 'One or more account-owned MCP servers are registered. Individual tools still require approval.' : mcpStatus === 'not_connected' ? 'No MCP servers are connected to this account.' : 'MCP connection state could not be checked.', count: mcp ?? undefined, actions: ['discover', 'approve', 'execute'] },
    builder_providers: { status: builderResults.some(([, value]) => value.status === 'ready') ? 'available' : 'partial', detail: 'Build-provider readiness is reported separately for each project type.' },
  };

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    timezone: req.nextUrl.searchParams.get('timezone')?.slice(0, 80) || 'UTC',
    account: { user_id: auth.user.id, is_platform_owner: isPlatformOwner(auth.profile), plan: (await getEffectiveUserPlan(auth.user.id, isPlatformOwner(auth.profile))).key },
    capabilities,
    builders,
    summary: {
      available: Object.values(capabilities).filter(item => item.status === 'available').length,
      partial: Object.values(capabilities).filter(item => item.status === 'partial').length,
      unavailable: Object.values(capabilities).filter(item => item.status === 'unavailable').length,
      not_connected: Object.values(capabilities).filter(item => item.status === 'not_connected').length,
    },
  }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization, Cookie' } });
}
