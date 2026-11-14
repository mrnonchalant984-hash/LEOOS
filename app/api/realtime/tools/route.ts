import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { createUserAssistantTools } from '@/lib/ai/tool-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_INTENT = /\b(run|execute|start|launch)\b.{0,60}\b(agent|specialist)\b/i;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,96}$/;

/** Authenticated server-side function-call bridge for constrained Gemini Live sessions. */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use Leo tools.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-realtime-tools', 30, 60);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = body?.name;
  const userMessage = body?.user_message;
  const args = body?.args;
  if (typeof name !== 'string' || !OBJECT_ID.test(name) || typeof userMessage !== 'string' || !userMessage.trim() || userMessage.length > 12000 || !args || typeof args !== 'object' || Array.isArray(args)) {
    return NextResponse.json({ error: 'Invalid voice tool request.' }, { status: 400 });
  }

  try {
    const registry = await createUserAssistantTools(auth.user.id, {
      request: req,
      userMessage,
      allowBuildActions: false,
      allowDeployment: false,
      allowRepositoryAccess: true,
      allowRepositoryWrites: false,
      allowAgentExecution: AGENT_INTENT.test(userMessage),
    });
    const tool = registry.tools.find(item => item.name === name);
    if (!tool) return NextResponse.json({ error: 'This tool is not authorized for the current voice request.' }, { status: 403 });

    const result = await registry.execute(name, args as Record<string, unknown>);
    const resultText = result.text.length > 60000
      ? `${result.text.slice(0, 60000)}\n[Tool output truncated by the secure voice bridge; request a narrower result.]`
      : result.text;
    return NextResponse.json({ result: resultText, isError: Boolean(result.isError) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Leo realtime tool execution failed', {
      userId: auth.user.id,
      tool: name,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'The authorized tool could not be completed.' }, { status: 502 });
  }
}
