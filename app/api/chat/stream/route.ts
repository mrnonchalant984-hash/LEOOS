import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getLeoSystemPrompt } from '@/lib/leo-system-prompt';
import { generateTextStream, getDefaultTextModel, ModelProviderError, type ModelMessage } from '@/lib/ai/provider-registry';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { enforceLeoCodeDailyQuota } from '@/lib/leocode-entitlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function event(controller: ReadableStreamDefaultController<Uint8Array>, value: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to use streamed Leo chat.' }, { status: 401 });
  try {
    const quota = await enforceLeoCodeDailyQuota(ctx.user.id);
    if (quota.response) return quota.response;
  } catch {
    return NextResponse.json({ error: 'Leo access could not be verified. Try again later.' }, { status: 503 });
  }
  const limited = await enforceUserRateLimit(ctx.user.id, 'leo-chat-stream', 30, 60);
  if (limited) return limited;

  let body: { session_id?: unknown; message?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !message || message.length > 20_000) {
    return NextResponse.json({ error: 'A valid chat session and message are required.' }, { status: 400 });
  }
  const model = typeof body.model === 'string' && body.model.length <= 160 ? body.model : getDefaultTextModel();
  const db = adminSupabase();
  const { data: chat, error: chatError } = await db.from('chats_v2').select('messages,user_id').eq('id', sessionId).maybeSingle();
  if (chatError) return NextResponse.json({ error: 'Chat history is temporarily unavailable.' }, { status: 503 });
  if (chat && chat.user_id !== ctx.user.id) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
  const history = Array.isArray(chat?.messages) ? chat.messages as Array<{ role?: unknown; content?: unknown }> : [];
  let historyBudget = 24_000;
  const boundedHistory: ModelMessage[] = [];
  for (const item of history.slice(-20).reverse()) {
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || historyBudget <= 0) continue;
    const content = item.content.slice(0, historyBudget);
    boundedHistory.unshift({ role: item.role, content });
    historyBudget -= content.length;
  }
  const messages: ModelMessage[] = [
    { role: 'system', content: getLeoSystemPrompt() },
    ...boundedHistory,
    { role: 'user', content: message },
  ];

  const abortController = new AbortController();
  if (req.signal.aborted) abortController.abort(req.signal.reason);
  else req.signal.addEventListener('abort', () => abortController.abort(req.signal.reason), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      event(controller, { type: 'start', requestId: randomUUID() });
      void (async () => {
        try {
          const result = await generateTextStream({ model, messages, signal: abortController.signal, temperature: 0.7, maxOutputTokens: 1200 }, chunk => {
            if (!abortController.signal.aborted) event(controller, { type: 'delta', text: chunk });
          });
          if (abortController.signal.aborted) return;
          const updated = [...history, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: result.text }];
          const write = chat
            ? await db.from('chats_v2').update({ messages: updated, updated_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', ctx.user.id)
            : await db.from('chats_v2').insert({ id: sessionId, user_id: ctx.user.id, title: message.slice(0, 60), messages: updated, updated_at: new Date().toISOString() });
          if (write.error) throw new Error('The response streamed, but chat history could not be saved.');
          if (result.usage) await db.from('ai_usage').insert({ user_id: ctx.user.id, feature: 'chat', model: `${result.provider}/${result.model}`, prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens, credits_used: 0, metadata: { session_id: sessionId, streamed: true } });
          event(controller, { type: 'done', usage: result.usage, model: `${result.provider}/${result.model}` });
        } catch (error) {
          if (!abortController.signal.aborted) {
            const message = error instanceof ModelProviderError ? error.message : 'Leo could not complete the streamed response.';
            event(controller, { type: 'error', error: message });
          }
        } finally {
          try { controller.close(); } catch { /* Client may have disconnected. */ }
        }
      })();
    },
    cancel() { abortController.abort(new Error('Client cancelled the stream.')); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
