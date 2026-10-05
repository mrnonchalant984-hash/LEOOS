import { NextRequest, NextResponse } from 'next/server';
import { getOpenAI, LEO_SYSTEM_PROMPT } from '@/lib/openai';
import { getProfile } from '@/lib/auth';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const ctx = await getProfile(req);
    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) return NextResponse.json({ error: 'Research query required.' }, { status: 400 });
    const client = getOpenAI();
    const response = await client.responses.create({
      model: process.env.LEO_RESEARCH_MODEL || 'gpt-5.6-luna',
      tools: [{ type: 'web_search' }],
      input: `${LEO_SYSTEM_PROMPT}\n\nResearch the user's request using current web information. Distinguish verified current facts from uncertainty. For AI-tool recommendations, compare the user's goal, current capabilities, free/free-tier availability when verified, important limitations, and official websites. Never invent pricing or capabilities.\n\nUser request: ${query}`,
    });
    return NextResponse.json({ reply: response.output_text || 'No research result was returned.', live: true, authenticated: Boolean(ctx) });
  } catch (error) {
    console.error('Research error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Live research is unavailable.' }, { status: 500 });
  }
}
