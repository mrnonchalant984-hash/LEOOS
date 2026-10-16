import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { createUserAssistantTools } from '@/lib/ai/tool-orchestrator';
import { getActiveDeveloperPlan } from '@/lib/developer-agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view your approved read-only tools.' }, { status: 401 });

  try {
    const [{ tools }, plan] = await Promise.all([
      createUserAssistantTools(ctx.user.id),
      getActiveDeveloperPlan(ctx.user.id),
    ]);
    let agents: Array<{ id: string; name: string; description: string; allowed_tools: string[] }> = [];
    if (plan) {
      const { data, error } = await adminSupabase().from('developer_custom_agents')
        .select('id,name,description,allowed_tools')
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: 'Your custom agents could not be loaded. Apply the developer agent migration if needed.' }, { status: 503 });
      agents = data || [];
    }
    return NextResponse.json({
      tools: tools.map(({ name, description }) => ({ name, description })),
      agents,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('Approved tool inventory load failed', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Your approved tools could not be loaded.' }, { status: 503 });
  }
}
