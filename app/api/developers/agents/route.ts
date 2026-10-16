import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { createUserAssistantTools } from '@/lib/ai/tool-orchestrator';
import { getActiveDeveloperPlan } from '@/lib/developer-agents';
import { parseDeveloperAgentInput } from '@/lib/developer-agent-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireDeveloperAccess(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const plan = await getActiveDeveloperPlan(context.user.id);
  if (!plan) return { error: NextResponse.json({ error: 'An active paid Developer API plan is required for Agent Studio.' }, { status: 403 }) };
  return { context, plan };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireDeveloperAccess(req);
    if ('error' in access) return access.error;
    const db = adminSupabase();
    const [{ data: agents, error }, { tools }] = await Promise.all([
      db.from('developer_custom_agents')
        .select('id,name,description,instructions,allowed_tools,created_at,updated_at')
        .eq('user_id', access.context.user.id)
        .order('created_at', { ascending: false }),
      createUserAssistantTools(access.context.user.id),
    ]);
    if (error) return NextResponse.json({ error: 'Custom agents could not be loaded. Apply the developer agent migration if it is missing.' }, { status: 503 });
    return NextResponse.json({
      plan: access.plan.key,
      agents: agents || [],
      tools: tools.map(({ name, description }) => ({ name, description })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('Developer Agent Studio load failed', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Developer Agent Studio is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireDeveloperAccess(req);
    if ('error' in access) return access.error;
    const body = await req.json().catch(() => null);
    const input = parseDeveloperAgentInput(body);
    if (!input) return NextResponse.json({ error: 'Provide a 3–50 character name, short description, 30–4000 character instructions, and up to 8 approved tools.' }, { status: 400 });
    const { tools } = await createUserAssistantTools(access.context.user.id);
    const availableNames = new Set(tools.map(tool => tool.name));
    if (input.allowed_tools.some(name => !availableNames.has(name))) {
      return NextResponse.json({ error: 'Only currently available account-approved read-only tools can be attached.' }, { status: 400 });
    }
    const { data, error } = await adminSupabase().from('developer_custom_agents').insert({
      user_id: access.context.user.id,
      ...input,
    }).select('id,name,description,instructions,allowed_tools,created_at,updated_at').single();
    if (error?.code === '23505') return NextResponse.json({ error: 'You already have an agent with that name.' }, { status: 409 });
    if (error || !data) return NextResponse.json({ error: 'The custom agent could not be saved.' }, { status: 503 });
    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (cause) {
    console.error('Developer Agent Studio create failed', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Developer Agent Studio is temporarily unavailable.' }, { status: 503 });
  }
}
