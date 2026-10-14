import { NextRequest, NextResponse } from 'next/server';
import { createTextResponse, getConfiguredModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(request: NextRequest) {
  // This endpoint is deliberately local-model-only. It never falls back to a hosted AI provider.
  if (process.env.LEO_OFFLINE_MODE !== 'true' || !process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    return NextResponse.json({ error: 'Local offline chat is not configured. Set LEO_OFFLINE_MODE=true and LEO_LOCAL_MODEL_URL in .env.local, install a local model, and restart the app.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null) as { messages?: unknown } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
    return NextResponse.json({ error: 'Send between 1 and 20 recent user/assistant messages.' }, { status: 400 });
  }
  const messages: ChatMessage[] = [];
  let totalLength = 0;
  for (const item of body.messages) {
    if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid chat message.' }, { status: 400 });
    const message = item as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string' || !message.content.trim()) {
      return NextResponse.json({ error: 'Each message needs a user/assistant role and non-empty text.' }, { status: 400 });
    }
    totalLength += message.content.length;
    if (message.content.length > 12000 || totalLength > 30000) return NextResponse.json({ error: 'The offline chat context is too long. Start a new conversation or shorten the messages.' }, { status: 413 });
    messages.push({ role: message.role as ChatMessage['role'], content: message.content.trim() });
  }
  if (messages[messages.length - 1]?.role !== 'user') return NextResponse.json({ error: 'The last message must be from the user.' }, { status: 400 });
  try {
    const response = await createTextResponse({
      model: getConfiguredModel('qwen2.5:3b'),
      input: [
        { role: 'system', content: 'You are Leo, a helpful local AI assistant running on this device. You are offline: do not claim to have accessed the internet, cloud accounts, live data, or remote files. Be clear when a task requires online services or tools that are not available locally.' },
        ...messages,
      ],
      max_output_tokens: 1200,
      temperature: 0.5,
    });
    if (!response.output_text.trim()) throw new Error('The local model returned an empty response.');
    return NextResponse.json({ reply: response.output_text.trim(), model: getConfiguredModel('qwen2.5:3b'), local: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The local model request failed.';
    return NextResponse.json({ error: `Local model did not respond. Confirm Ollama is running, the model is downloaded, and LEO_LOCAL_MODEL_URL is correct. Details: ${detail}` }, { status: 502 });
  }
}
