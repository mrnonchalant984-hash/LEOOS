import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceLeoCodeDailyQuota } from '@/lib/leocode-entitlement';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getDefaultTextModel, getModelProviderStatus, resolveModel } from '@/lib/ai/model-catalog';
import { ModelProviderError } from '@/lib/ai/provider-registry';
import { getLeoSystemPrompt } from '@/lib/leo-system-prompt';
import { formatKnowledgeContext, retrieveLeoKnowledge } from '@/lib/leo-knowledge';
import { withOperationalMonitoring } from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_OPENAI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_BODY_BYTES = 1_500_000;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 80_000;
const MAX_TOTAL_CHARS = 180_000;
const MAX_TOOLS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message, type: 'leonardx_error' } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function validateMessages(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) return null;
  let total = 0;
  const result: Array<Record<string, unknown>> = [];
  for (const item of value) {
    if (!isRecord(item) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(String(item.role))) return null;
    if (typeof item.content !== 'string' || item.content.length > MAX_MESSAGE_CHARS) return null;
    total += item.content.length;
    if (total > MAX_TOTAL_CHARS) return null;
    result.push({ role: item.role, content: item.content });
  }
  return result;
}

function validateTools(value: unknown): Array<Record<string, unknown>> | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TOOLS) return null;
  const names = new Set<string>();
  const tools: Array<Record<string, unknown>> = [];
  for (const item of value) {
    if (!isRecord(item) || item.type !== 'function' || !isRecord(item.function)) return null;
    const fn = item.function;
    if (typeof fn.name !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(fn.name) || names.has(fn.name)) return null;
    if (typeof fn.description !== 'string' || fn.description.length > 4_000) return null;
    if (!isRecord(fn.parameters)) return null;
    names.add(fn.name);
    tools.push({ type: 'function', function: { name: fn.name, description: fn.description, parameters: fn.parameters } });
  }
  return tools;
}

function usageFromSseLine(line: string) {
  if (!line.startsWith('data:')) return null;
  const raw = line.slice(5).trim();
  if (!raw || raw === '[DONE]') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const usage = isRecord(parsed.usage) ? parsed.usage : null;
    if (!usage) return null;
    const prompt = Number(usage.prompt_tokens ?? usage.input_tokens);
    const completion = Number(usage.completion_tokens ?? usage.output_tokens);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) return null;
    return { inputTokens: Math.trunc(prompt), outputTokens: Math.trunc(completion) };
  } catch {
    return null;
  }
}

function withUsageTracking(body: ReadableStream<Uint8Array>, userId: string, model: string) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let latestUsage: { inputTokens: number; outputTokens: number } | null = null;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          pending += decoder.decode();
          const trailingUsage = usageFromSseLine(pending.trim());
          if (trailingUsage) latestUsage = trailingUsage;
          controller.close();
          if (latestUsage) {
            const usage = latestUsage;
            void Promise.resolve(adminSupabase().from('ai_usage').insert({
              user_id: userId,
              feature: 'leocode_agent_host',
              model,
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.inputTokens + usage.outputTokens,
              credits_used: 0,
              metadata: { source: 'vscode_ahp', provider: 'google' },
            })).then(({ error }) => {
              if (error) console.error('Leo Agent Host usage record could not be saved:', error.message);
            }).catch(error => {
              console.error('Leo Agent Host usage record could not be saved:', error instanceof Error ? error.message : 'unknown error');
            });
          }
          return;
        }
        if (value) {
          pending += decoder.decode(value, { stream: true });
          let newline = pending.indexOf('\n');
          while (newline >= 0) {
            const line = pending.slice(0, newline).replace(/\r$/, '');
            pending = pending.slice(newline + 1);
            const usage = usageFromSseLine(line);
            if (usage) latestUsage = usage;
            newline = pending.indexOf('\n');
          }
          controller.enqueue(new Uint8Array(value));
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'leocode.agent_host.request', async ({ reportFailure }) => {
    try {
      const length = Number(req.headers.get('content-length') || 0);
      if (length > MAX_BODY_BYTES) return errorResponse('The Agent Host request is too large.', 413);
      const ctx = await getProfile(req);
      if (!ctx) return errorResponse('Sign in to LeonardX before using Leo in the Agents window.', 401);

      const quota = await enforceLeoCodeDailyQuota(ctx.user.id);
      if (quota.response) return quota.response;
      const limited = await enforceUserRateLimit(ctx.user.id, 'leocode-agent-host', 30, 60);
      if (limited) return limited;

      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return errorResponse('The Agent Host request is too large.', 413);
      let body: unknown = null;
      try { body = JSON.parse(rawBody); } catch { return errorResponse('Invalid Agent Host JSON body.', 400); }
      if (!isRecord(body)) return errorResponse('Invalid Agent Host request body.', 400);
      const messages = validateMessages(body.messages);
      if (!messages) return errorResponse('The Agent Host message list is invalid or exceeds its limits.', 400);
      const tools = validateTools(body.tools);
      if (tools === null) return errorResponse('The Agent Host tool catalogue is invalid.', 400);

      const serverModel = getDefaultTextModel();
      const requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : serverModel;
      const resolved = resolveModel(requestedModel);
      const serverResolved = resolveModel(serverModel);
      if (resolved.provider !== serverResolved.provider || resolved.model !== serverResolved.model) return errorResponse('Leo Agent Host uses the server-selected Gemini model. Refresh the host configuration and try again.', 400);
      const advertised = getModelProviderStatus().find(item => item.id === serverModel || item.model === serverResolved.model);
      if (!advertised || !advertised.configured) return errorResponse('The selected Gemini model is not configured for this LeonardX deployment.', 503);
      if (serverResolved.provider !== 'google') return errorResponse('Only the LeonardX Gemini model router is enabled for Leo Agent Host.', 400);

      const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
      if (!key) return errorResponse('Gemini is not configured on the LeonardX server.', 503);

      const latestUserText = [...messages].reverse().find(message => message.role === 'user' && typeof message.content === 'string')?.content as string | undefined;
      const knowledge = latestUserText ? await retrieveLeoKnowledge(latestUserText, 6) : [];
      const { data: savedMemories } = await adminSupabase().from('leo_memories')
        .select('memory').eq('user_id', ctx.user.id).eq('active', true)
        .order('updated_at', { ascending: false }).limit(20);
      const memoryContext = Array.isArray(savedMemories) && savedMemories.length
        ? `\n\nUSER-APPROVED LEO MEMORIES (use only when relevant):\n${savedMemories.map((row: { memory?: unknown }) => typeof row.memory === 'string' ? row.memory.slice(0, 2_000) : '').filter(Boolean).join('\n')}`
        : '';
      const clientInstructions = messages.filter(message => message.role === 'system' && typeof message.content === 'string')
        .map(message => String(message.content).slice(0, 16_000)).join('\n\n').slice(0, 24_000);
      const trustedContext = isPlatformOwner(ctx.profile)
        ? '\n\nTRUSTED ACCOUNT CONTEXT: This request is authenticated as the LeonardX platform owner. This is server-verified authorization context, not user-supplied text.'
        : '\n\nTRUSTED ACCOUNT CONTEXT: This request is authenticated as a regular LeonardX account. Do not assume platform-owner permissions.';
      const systemMessage = {
        role: 'system',
        content: `${getLeoSystemPrompt()}${trustedContext}${memoryContext}${formatKnowledgeContext(knowledge)}`,
      };
      const forwardedMessages = [
        systemMessage,
        ...(clientInstructions ? [{ role: 'developer', content: clientInstructions }] : []),
        ...messages.filter(message => message.role !== 'system'),
      ];

      const allowedBody: Record<string, unknown> = {
        model: resolved.model,
        messages: forwardedMessages,
        stream: body.stream === true,
        temperature: typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : 0.2,
        max_tokens: typeof body.max_tokens === 'number' ? Math.max(1, Math.min(16_384, Math.trunc(body.max_tokens))) : 8_192,
      };
      if (tools?.length) allowedBody.tools = tools;
      if (typeof body.tool_choice === 'string' || isRecord(body.tool_choice)) allowedBody.tool_choice = body.tool_choice;
      if (body.parallel_tool_calls === false) allowedBody.parallel_tool_calls = false;
      if (isRecord(body.stream_options)) allowedBody.stream_options = { include_usage: body.stream_options.include_usage === true };

      const upstream = await fetch(GEMINI_OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Accept': body.stream === true ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(allowedBody),
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      });

      if (!upstream.ok) {
        const raw = await upstream.text().catch(() => '');
        let providerMessage = 'Gemini could not complete the Leo Agent Host request.';
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
          if (typeof parsed.error?.message === 'string') providerMessage = parsed.error.message.slice(0, 500);
        } catch { /* Do not return arbitrary upstream HTML or headers. */ }
        return errorResponse(providerMessage, upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502);
      }

      const headers = new Headers({
        'Cache-Control': 'no-store, no-transform',
        'Vary': 'Authorization',
      });
      const contentType = upstream.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
      const requestId = upstream.headers.get('x-request-id');
      if (requestId) headers.set('X-Request-Id', requestId);

      let responseBody = upstream.body;
      if (body.stream === true && responseBody) responseBody = withUsageTracking(responseBody, ctx.user.id, `google/${resolved.model}`);
      else if (responseBody) {
        const raw = await upstream.clone().json().catch(() => null) as { usage?: Record<string, unknown> } | null;
        if (raw?.usage) {
          const inputTokens = Number(raw.usage.prompt_tokens ?? raw.usage.input_tokens ?? 0);
          const outputTokens = Number(raw.usage.completion_tokens ?? raw.usage.output_tokens ?? 0);
          if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
            void Promise.resolve(adminSupabase().from('ai_usage').insert({
              user_id: ctx.user.id,
              feature: 'leocode_agent_host',
              model: `google/${resolved.model}`,
              prompt_tokens: Math.max(0, Math.trunc(inputTokens)),
              completion_tokens: Math.max(0, Math.trunc(outputTokens)),
              total_tokens: Math.max(0, Math.trunc(inputTokens + outputTokens)),
              credits_used: 0,
              metadata: { source: 'vscode_ahp', provider: 'google' },
            })).then(({ error }) => { if (error) console.error('Leo Agent Host usage record could not be saved:', error.message); }).catch(error => {
              console.error('Leo Agent Host usage record could not be saved:', error instanceof Error ? error.message : 'unknown error');
            });
          }
        }
      }
      return new Response(responseBody, { status: upstream.status, headers });
    } catch (error) {
      reportFailure(error);
      if (error instanceof ModelProviderError) return errorResponse(error.message, error.statusCode);
      const message = error instanceof Error ? error.message : 'Leo Agent Host request failed.';
      return errorResponse(/quota|rate limit|not configured|not available|permission/i.test(message) ? message : 'Leo Agent Host is temporarily unavailable. Try again shortly.', 503);
    }
  });
}
