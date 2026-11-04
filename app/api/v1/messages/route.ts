import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI, type Content } from '@google/genai';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authorizeBillableUsage, settleBillableUsage, withApiKey } from '@/lib/api-auth';
import { emitWebhookEvent } from '@/lib/webhooks';
import { calculateApiCredits, getSupportedApiModels, isApiModel, type ApiModel } from '@/lib/api-plan-catalog';

export const runtime = 'nodejs';
export const maxDuration = 60;

type InputMessage = { role: 'system' | 'user' | 'assistant'; content: string };
const MAX_INPUT_CHARS = 40_000;
const MAX_OUTPUT_TOKENS = 4096;
const getApiKey = () => process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '';

function mapMessages(messages: InputMessage[]) {
  const systemInstruction = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const contents: Content[] = messages.filter(message => message.role !== 'system').map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  return { systemInstruction, contents };
}

function mapFinishReason(reason: unknown) {
  if (reason === 'MAX_TOKENS' || reason === 'max_tokens') return 'max_tokens';
  if (reason === 'SAFETY' || reason === 'RECITATION') return 'refusal';
  return 'end_turn';
}

export async function POST(req: NextRequest) {
  return withApiKey(req, 'write', async (auth) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiResponse({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON object.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const requestedModel = typeof body.model === 'string' ? body.model : 'gemini-3.8-flash';
    if (!isApiModel(requestedModel) || !getSupportedApiModels().includes(requestedModel as ApiModel)) {
      return apiResponse({ error: { code: 'MODEL_NOT_FOUND', message: 'The requested Gemini model is not available to this API.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const model: ApiModel = requestedModel;
    if (body.stream !== undefined && typeof body.stream !== 'boolean') {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'stream must be a boolean.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 50) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'messages must contain between 1 and 50 entries.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const messages: InputMessage[] = [];
    let inputChars = 0;
    let inputBytes = 0;
    for (const message of body.messages) {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
        return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'Each message requires a supported role and non-empty string content.' }, request_id: auth.requestId }, 400, auth.requestId);
      }
      inputChars += message.content.length;
      if (inputChars > MAX_INPUT_CHARS) return apiResponse({ error: { code: 'REQUEST_TOO_LARGE', message: 'The combined message content exceeds the 40,000-character limit.' }, status: 413, request_id: auth.requestId }, 413, auth.requestId);
      inputBytes += new TextEncoder().encode(message.content).byteLength;
      messages.push({ role: message.role, content: message.content });
    }
    if (!messages.some(message => message.role === 'user')) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'At least one user message is required.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const maxTokensRaw = Number(body.max_tokens ?? 1024);
    if (!Number.isInteger(maxTokensRaw) || maxTokensRaw < 1 || maxTokensRaw > MAX_OUTPUT_TOKENS) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: `max_tokens must be an integer from 1 to ${MAX_OUTPUT_TOKENS}.` }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const apiKey = getApiKey();
    if (!apiKey) return apiResponse({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Gemini model access is temporarily unavailable.' }, request_id: auth.requestId }, 503, auth.requestId);

    const inputTokenCeiling = inputBytes + messages.length * 16;
    const reservedCredits = calculateApiCredits(model, inputTokenCeiling, maxTokensRaw);
    if (reservedCredits === null) return apiResponse({ error: { code: 'MODEL_NOT_FOUND', message: 'The requested model has no verified Gemini billing rate.' }, request_id: auth.requestId }, 400, auth.requestId);
    const authorization = await authorizeBillableUsage(auth, reservedCredits);
    if (!authorization.ok) return authorization.response;

    const startedAt = Date.now();
    const client = new GoogleGenAI({ apiKey });
    const { systemInstruction, contents } = mapMessages(messages);
    const config = { maxOutputTokens: maxTokensRaw, ...(systemInstruction ? { systemInstruction } : {}) };
    const safeLog = (error: unknown) => console.error('LeonardX Gemini API inference failed', { requestId: auth.requestId, errorType: error instanceof Error ? error.name : 'unknown' });

    if (body.stream === true) {
      const encoder = new TextEncoder();
      const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const streamBody = new ReadableStream<Uint8Array>({
        start(controller) {
          void (async () => {
            let inputTokens = 0;
            let outputTokens = 0;
            let providerAccepted = false;
            const messageId = `msg_${auth.requestId.replace(/[^A-Za-z0-9_-]/g, '')}`;
            try {
              const stream = await client.models.generateContentStream({ model, contents, config });
              providerAccepted = true;
              controller.enqueue(sse('message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }));
              controller.enqueue(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
              let finishReason: unknown = null;
              for await (const chunk of stream) {
                const delta = typeof chunk.text === 'string' ? chunk.text : '';
                if (delta) controller.enqueue(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } }));
                const usage = chunk.usageMetadata;
                if (usage?.promptTokenCount !== undefined) inputTokens = usage.promptTokenCount;
                if (usage?.candidatesTokenCount !== undefined) outputTokens = usage.candidatesTokenCount;
                finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
              }
              if (!inputTokens && !outputTokens) throw new Error('Gemini did not return measured usage; billing settlement is unsafe.');
              auth.providerUsageMeasured = true;
              const actualCredits = calculateApiCredits(model, inputTokens, outputTokens);
              if (actualCredits === null) throw new Error('Provider usage returned an unpriced model.');
              await settleBillableUsage(auth, actualCredits);
              const billedCredits = auth.owner ? 0 : actualCredits;
              await adminSupabase().from('ai_usage').insert({ user_id: auth.userId, feature: 'developer_api', model, total_tokens: inputTokens + outputTokens, credits_used: billedCredits });
              after(async () => { try { await emitWebhookEvent(auth.userId, 'api.usage.completed', { request_id: auth.requestId, model, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, credits_used: billedCredits, duration_ms: Date.now() - startedAt }); } catch { /* queued delivery retries handle transient failures */ } });
              controller.enqueue(sse('content_block_stop', { type: 'content_block_stop', index: 0 }));
              controller.enqueue(sse('message_delta', { type: 'message_delta', delta: { stop_reason: mapFinishReason(finishReason), stop_sequence: null }, usage: { output_tokens: outputTokens, input_tokens: inputTokens, total_tokens: inputTokens + outputTokens, credits_used: billedCredits } }));
              controller.enqueue(sse('message_stop', { type: 'message_stop' }));
              controller.close();
            } catch (error) {
              safeLog(error);
              if (auth.usageId) { try { if (providerAccepted && auth.reservedCredits) await settleBillableUsage(auth, auth.reservedCredits); else await adminSupabase().rpc('refund_api_request_credit', { p_usage_id: auth.usageId }); } catch { /* retain reservation if reconciliation fails */ } }
              controller.enqueue(sse('error', { type: 'error', error: { type: 'api_error', message: 'The model stream failed. Please retry shortly.' }, request_id: auth.requestId }));
              controller.close();
            }
          })();
        },
      });
      return new NextResponse(streamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Request-ID': auth.requestId, 'X-Content-Type-Options': 'nosniff' } });
    }

    let providerAccepted = false;
    try {
      const completion = await client.models.generateContent({ model, contents, config });
      providerAccepted = true;
      const inputTokens = completion.usageMetadata?.promptTokenCount;
      const outputTokens = completion.usageMetadata?.candidatesTokenCount;
      if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) throw new Error('Gemini did not return measured usage; billing settlement is unsafe.');
      auth.providerUsageMeasured = true;
      const input = Math.max(0, Math.trunc(inputTokens || 0));
      const output = Math.max(0, Math.trunc(outputTokens || 0));
      const actualCredits = calculateApiCredits(model, input, output);
      if (actualCredits === null) throw new Error('Provider usage returned an unpriced model.');
      await settleBillableUsage(auth, actualCredits);
      const billedCredits = auth.owner ? 0 : actualCredits;
      await adminSupabase().from('ai_usage').insert({ user_id: auth.userId, feature: 'developer_api', model, total_tokens: input + output, credits_used: billedCredits });
      after(async () => { try { await emitWebhookEvent(auth.userId, 'api.usage.completed', { request_id: auth.requestId, model, input_tokens: input, output_tokens: output, total_tokens: input + output, credits_used: billedCredits, duration_ms: Date.now() - startedAt }); } catch { /* queued delivery retries handle transient failures */ } });
      const answer = completion.text || '';
      const finishReason = completion.candidates?.[0]?.finishReason;
      return apiResponse({ id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', model, content: [{ type: 'text', text: answer }], stop_reason: mapFinishReason(finishReason), stop_sequence: null, usage: { input_tokens: input, output_tokens: output, total_tokens: input + output, credits_used: billedCredits }, request_id: auth.requestId }, 200, auth.requestId);
    } catch (error) {
      safeLog(error);
      if (auth.usageId) { try { if (providerAccepted && auth.reservedCredits) await settleBillableUsage(auth, auth.reservedCredits); else await adminSupabase().rpc('refund_api_request_credit', { p_usage_id: auth.usageId }); } catch { /* retain reservation if reconciliation fails */ } }
      return apiResponse({ error: { code: 'INFERENCE_FAILED', message: 'The model request failed. Please retry shortly.' }, request_id: auth.requestId }, 502, auth.requestId);
    }
  });
}
