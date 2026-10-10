import { NextRequest, NextResponse } from 'next/server';
import { getOpenAI, LEO_SYSTEM_PROMPT } from '@/lib/openai';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to use live research.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 4000) : '';
  if (!query) return NextResponse.json({ error: 'Research query required.' }, { status: 400 });

  const limited = await enforceUserRateLimit(ctx.user.id, 'live-research', 10, 60);
  if (limited) return limited;

  try {
    const response = await getOpenAI().responses.create({
      model: process.env.LEO_RESEARCH_MODEL || 'gpt-5.6-luna',
      tools: [{ type: 'web_search' }],
      input: `${LEO_SYSTEM_PROMPT}\n\nResearch the user's request using current web information. Distinguish verified current facts from uncertainty. For AI-tool recommendations, compare the user's goal, current capabilities, free/free-tier availability when verified, important limitations, and official websites. Never invent pricing or capabilities.\n\nUser request: ${query}`,
    });

    return NextResponse.json({ reply: response.output_text || 'No research result was returned.', live: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Research request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Live research is temporarily unavailable.' }, { status: 502 });
  }
}
