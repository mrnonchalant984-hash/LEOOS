import { after, NextRequest, NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authorizeBillableUsage, settleBillableUsage, withApiKey } from '@/lib/api-auth';
import { emitWebhookEvent } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const maxDuration = 60;

type InputMessage = { role: 'system' | 'user' | 'assistant'; content: string };
const MAX_INPUT_CHARS = 40_000;
const MAX_OUTPUT_TOKENS = 4096;

function supportedModels() {
  const configured = (process.env.LEONARDX_API_MODELS || 'gpt-4o-mini')
    .split(',').map((model) => model.trim()).filter((model) => /^[a-zA-Z0-9._-]{1,80}$/.test(model));
  return new Set(configured.length ? configured : ['gpt-4o-mini']);
}

export async function POST(req: NextRequest) {
  return withApiKey(req, 'write', async (auth) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiResponse({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON object.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const model = typeof body.model === 'string' ? body.model : 'gpt-4o-mini';
    if (!supportedModels().has(model)) {
      return apiResponse({ error: { code: 'MODEL_NOT_FOUND', message: 'The requested model is not available to this API.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    if (body.stream !== undefined && typeof body.stream !== 'boolean') {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'stream must be a boolean.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 50) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'messages must contain between 1 and 50 entries.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const messages: InputMessage[] = [];
    let inputChars = 0;
    for (const message of body.messages) {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
        return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'Each message requires a supported role and non-empty string content.' }, request_id: auth.requestId }, 400, auth.requestId);
      }
      inputChars += message.content.length;
      if (inputChars > MAX_INPUT_CHARS) return apiResponse({ error: { code: 'REQUEST_TOO_LARGE', message: 'The combined message content exceeds the 40,000-character limit.' }, request_id: auth.requestId }, 413, auth.requestId);
      messages.push({ role: message.role, content: message.content });
    }
    if (!messages.some((message) => message.role === 'user')) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'At least one user message is required.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const maxTokensRaw = Number(body.max_tokens ?? 1024);
    if (!Number.isInteger(maxTokensRaw) || maxTokensRaw < 1 || maxTokensRaw > MAX_OUTPUT_TOKENS) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: `max_tokens must be an integer from 1 to ${MAX_OUTPUT_TOKENS}.` }, request_id: auth.requestId }, 400, auth.requestId);
    }

    // Reserve against a conservative character-based estimate before calling the provider.
    // Measured token usage settles the reservation after the provider returns.
    const reservedCredits = Math.min(100, Math.max(1, Math.ceil((inputChars + maxTokensRaw) / 1000)));
    const authorization = await authorizeBillableUsage(auth, reservedCredits);
    if (!authorization.ok) return authorization.response;

    const startedAt = Date.now();
    try {
      const client = getOpenAI();
      if (body.stream === true) {
        const encoder = new TextEncoder();
        const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        const streamBody = new ReadableStream<Uint8Array>({
          start(controller) {
            void (async () => {
              let messageId = `msg_${auth.requestId.replace(/[^A-Za-z0-9_-]/g, '')}`;
              let providerModel = model;
              let inputTokens = 0;
              let outputTokens = 0;
              let finishReason: string | null = null;
              try {
                const stream = await client.chat.completions.create({
                  model, messages, max_completion_tokens: maxTokensRaw, stream: true,
                  stream_options: { include_usage: true },
                });
                controller.enqueue(sse('message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model: providerModel, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }));
                controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
                for await (const chunk of stream) {
                  if (chunk.id) messageId = chunk.id;
                  if (chunk.model) providerModel = chunk.model;
                  const delta = chunk.choices[0]?.delta?.content;
                  if (typeof delta === 'string' && delta.length) controller.enqueue(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } }));
                  if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
                  if (chunk.usage) { inputTokens = chunk.usage.prompt_tokens; outputTokens = chunk.usage.completion_tokens; }
                }
                const totalTokens = inputTokens + outputTokens;
                const actualCredits = Math.max(1, Math.ceil(totalTokens / 1000));
                await settleBillableUsage(auth, actualCredits);
                const db = adminSupabase();
                await db.from('ai_usage').insert({ user_id: auth.userId, feature: 'developer_api', model: providerModel, total_tokens: totalTokens, credits_used: actualCredits });
                after(async () => {
                  try { await emitWebhookEvent(auth.userId, 'api.usage.completed', { request_id: auth.requestId, model: providerModel, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens, credits_used: actualCredits, duration_ms: Date.now() - startedAt }); }
                  catch { /* delivery retry worker handles transient failures */ }
                });
                controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: 0 }));
                controller.enqueue(sse('message_delta', { type: 'message_delta', delta: { stop_reason: finishReason === 'length' ? 'max_tokens' : finishReason === 'content_filter' ? 'refusal' : 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens, input_tokens: inputTokens, total_tokens: totalTokens, credits_used: actualCredits } }));
                controller.enqueue(sse('message_stop', { type: 'message_stop' }));
                controller.close();
              } catch (error) {
                if (auth.usageId) { try { await adminSupabase().rpc('refund_api_request_credit', { p_usage_id: auth.usageId }); } catch { /* retain stream error */ } }
                console.error('LeonardX streaming inference failed', { requestId: auth.requestId, error: error instanceof Error ? error.message : 'unknown' });
                controller.enqueue(sse('error', { type: 'error', error: { type: 'api_error', message: 'The model stream failed. Please retry shortly.' }, request_id: auth.requestId }));
                controller.close();
              }
            })();
          },
        });
        return new NextResponse(streamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Request-ID': auth.requestId, 'X-Content-Type-Options': 'nosniff' } });
      }
      const completion = await client.chat.completions.create({
        model,
        messages,
        max_completion_tokens: maxTokensRaw,
        stream: false,
      });
      const usage = completion.usage;
      const inputTokens = usage?.prompt_tokens ?? 0;
      const outputTokens = usage?.completion_tokens ?? 0;
      const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
      const actualCredits = Math.max(1, Math.ceil(totalTokens / 1000));
      await settleBillableUsage(auth, actualCredits);

      const db = adminSupabase();
      await db.from('ai_usage').insert({ user_id: auth.userId, feature: 'developer_api', model, total_tokens: totalTokens, credits_used: actualCredits });
      after(async () => {
        try { await emitWebhookEvent(auth.userId, 'api.usage.completed', { request_id: auth.requestId, model, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens, credits_used: actualCredits, duration_ms: Date.now() - startedAt }); }
        catch { /* queued delivery retries handle transient failures */ }
      });

      const answer = completion.choices[0]?.message?.content ?? '';
      const finishReason = completion.choices[0]?.finish_reason;
      return apiResponse({
        id: completion.id,
        type: 'message',
        role: 'assistant',
        model: completion.model,
        content: [{ type: 'text', text: answer }],
        stop_reason: finishReason === 'length' ? 'max_tokens' : finishReason === 'content_filter' ? 'refusal' : 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens, credits_used: actualCredits },
        request_id: auth.requestId,
      }, 200, auth.requestId);
    } catch (error) {
      // withApiKey refunds the reservation for 5xx responses. Keep provider details private.
      console.error('LeonardX API inference failed', { requestId: auth.requestId, error: error instanceof Error ? error.message : 'unknown' });
      return apiResponse({ error: { code: 'INFERENCE_FAILED', message: 'The model request failed. Please retry shortly.' }, request_id: auth.requestId }, 502, auth.requestId);
    }
  });
}
