import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { createUserAssistantTools } from '@/lib/ai/tool-orchestrator';
import { getActiveDeveloperPlan } from '@/lib/developer-agents';
import { parseDeveloperAgentInput } from '@/lib/developer-agent-input';

export const runtime = 'nodejs';

async function requireDeveloperAccess(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const plan = await getActiveDeveloperPlan(context.user.id);
  if (!plan) return { error: NextResponse.json({ error: 'An active paid Developer API plan is required for Agent Studio.' }, { status: 403 }) };
  return { context };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireDeveloperAccess(req);
    if ('error' in access) return access.error;
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid agent ID.' }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const input = parseDeveloperAgentInput(body);
    if (!input) return NextResponse.json({ error: 'Provide a 3–50 character name, short description, 30–4000 character instructions, and up to 8 approved tools.' }, { status: 400 });
    const { tools } = await createUserAssistantTools(access.context.user.id);
    const availableNames = new Set(tools.map(tool => tool.name));
    if (input.allowed_tools.some(name => !availableNames.has(name))) {
      return NextResponse.json({ error: 'Only currently available account-approved read-only tools can be attached.' }, { status: 400 });
    }
    const { data, error } = await adminSupabase().from('developer_custom_agents').update({
      ...input,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('user_id', access.context.user.id)
      .select('id,name,description,instructions,allowed_tools,created_at,updated_at').maybeSingle();
    if (error?.code === '23505') return NextResponse.json({ error: 'You already have an agent with that name.' }, { status: 409 });
    if (error) return NextResponse.json({ error: 'The custom agent could not be updated.' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'Custom agent not found.' }, { status: 404 });
    return NextResponse.json({ agent: data });
  } catch (cause) {
    console.error('Developer Agent Studio update failed', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Developer Agent Studio is temporarily unavailable.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireDeveloperAccess(req);
    if ('error' in access) return access.error;
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid agent ID.' }, { status: 400 });
    }
    const { data, error } = await adminSupabase().from('developer_custom_agents')
      .delete().eq('id', id).eq('user_id', access.context.user.id).select('id');
    if (error) return NextResponse.json({ error: 'The custom agent could not be deleted.' }, { status: 503 });
    if (!data?.length) return NextResponse.json({ error: 'Custom agent not found.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (cause) {
    console.error('Developer Agent Studio delete failed', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Developer Agent Studio is temporarily unavailable.' }, { status: 503 });
  }
}
