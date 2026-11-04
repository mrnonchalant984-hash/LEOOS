import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import { formatKnowledgeContext, retrieveLeoKnowledge } from '@/lib/leo-knowledge';
import { generateText, getDefaultTextModel } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth || !auth.profile.twofa_verified) {
    return NextResponse.json({ error: 'Owner 2FA access required' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const question = String(body.message || '').trim();
    if (!question) return NextResponse.json({ error: 'Message required.' }, { status: 400 });

    const rows = await retrieveLeoKnowledge(question, 8);
    const { data: instructions, error } = await adminSupabase()
      .from('leo_system_instructions')
      .select('content')
      .eq('active', true)
      .order('priority', { ascending: true })
      .limit(10);
    if (error) throw new Error('Leo system instructions could not be loaded.');

    const system = `You are Leo, the general AI assistant inside LEO OS. Test persistent knowledge without pretending it is model knowledge. Never claim actions you did not perform. Prefer verified/current sources when available.${(instructions || []).map((item: { content: string }) => `\n${item.content}`).join('')}${formatKnowledgeContext(rows)}`;
    const result = await generateText({
      model: getDefaultTextModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
      temperature: 0.3,
      maxOutputTokens: 1000,
    });
    return NextResponse.json({
      reply: result.text,
      model: result.model,
      sources: rows.map((item) => ({ id: item.id, title: item.title, category: item.category, source_type: item.source_type })),
    });
  } catch (error) {
    const apiError = error as { statusCode?: number; status?: number; message?: string };
    const status = apiError.statusCode || apiError.status || 500;
    const message = status === 429
      ? 'Gemini quota or rate limit reached. Check the configured Gemini project quota and retry.'
      : apiError.message || 'Leo training test failed.';
    return NextResponse.json({ error: message }, { status: status >= 400 && status <= 599 ? status : 500 });
  }
}
