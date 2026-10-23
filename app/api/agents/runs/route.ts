import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const db = adminSupabase();
  const [runs, approvals] = await Promise.all([
    db.from('agent_runs').select('id,agent_id,task,status,created_at,started_at,completed_at,error')
      .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30),
    db.from('agent_approvals').select('id,run_id,action,metadata,created_at')
      .eq('user_id', ctx.user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(30),
  ]);
  if (runs.error || approvals.error) {
    return NextResponse.json({ error: 'Agent runs and approvals could not be loaded. Verify the agent execution migration is applied.' }, { status: 500 });
  }
  return NextResponse.json({ runs: runs.data || [], approvals: approvals.data || [] });
}
