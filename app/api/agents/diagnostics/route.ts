import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const limited = await enforceUserRateLimit(context.user.id, 'agent-diagnostics', 30, 60);
  if (limited) return limited;

  const { data, error } = await adminSupabase()
    .from('agent_runs')
    .select('id,agent_id,status,metadata,created_at,started_at,completed_at')
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('Agent diagnostics could not be loaded:', error.code || 'unknown');
    return NextResponse.json({ error: 'Agent diagnostics are unavailable.' }, { status: 503 });
  }

  const runs = (data || []).map(run => {
    const metadata = run.metadata && typeof run.metadata === 'object'
      ? run.metadata as Record<string, unknown>
      : {};
    const execution = metadata.execution && typeof metadata.execution === 'object'
      ? metadata.execution as Record<string, unknown>
      : null;
    return {
      id: run.id,
      agent_id: run.agent_id,
      status: run.status,
      created_at: run.created_at,
      started_at: run.started_at,
      completed_at: run.completed_at,
      execution,
    };
  });

  return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'no-store' } });
}
