import { GoogleGenAI } from '@google/genai';
import { ModelProviderError, isProviderConfigured, resolveModel, type ModelMessage, type ModelProvider } from './model-catalog';
import { FunctionCallingConfigMode, type Content, type Part } from '@google/genai';
import { retryProviderRequest } from './provider-retry';

export { getDefaultTextModel, getModelProviderStatus, ModelProviderError, resolveModel } from './model-catalog';
export type { ModelMessage, ModelProvider } from './model-catalog';
export type TextGenerationRequest = {
  model: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
  maxOutputTokens?: number;
  temperature?: number;
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  /** Enable Gemini's grounded Google Search tool for current or explicitly researched questions. */
  webSearch?: boolean;
};
export type TextGenerationResult = {
  text: string;
  model: string;
  provider: ModelProvider;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  toolCalls?: Array<{ name: string; success: boolean }>;
  sources?: Array<{ title?: string; uri: string }>;
};
export type AssistantTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type AssistantToolExecutor = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<{ text: string; isError?: boolean }>;

function normalizeUsage(inputTokens?: number | null, outputTokens?: number | null) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  const input = Math.max(0, Math.trunc(inputTokens || 0));
  const output = Math.max(0, Math.trunc(outputTokens || 0));
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

async function withProviderError<T>(provider: ModelProvider, model: string, request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await retryProviderRequest(request, { signal, maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 4_000 });
  } catch (error) {
    if (error instanceof ModelProviderError) throw error;
    const candidate = error && typeof error === 'object' ? error as { status?: unknown; statusCode?: unknown } : {};
    const status = typeof candidate.status === 'number' ? candidate.status
      : typeof candidate.statusCode === 'number' ? candidate.statusCode : null;
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const safeStatus = status && status >= 400 && status <= 599 ? status : /timeout|timed out|aborterror|aborted/.test(message) ? 504 : 502;
    const providerName = 'Gemini';
    const cause = safeStatus === 401 || safeStatus === 403 ? 'rejected the configured credential or denied model access'
      : safeStatus === 404 ? 'could not find the configured model'
        : safeStatus === 429 ? 'reached a rate or quota limit'
          : safeStatus >= 500 ? 'is temporarily unavailable'
            : 'rejected the generation request';
    throw new ModelProviderError(`${providerName} model ${model} ${safeStatus === 504 ? 'timed out before completing the request' : cause} (HTTP ${safeStatus}). ${safeStatus === 504 ? 'Retry once; if it repeats, reduce the request size.' : 'Check the model ID, provider key, and quota.'}`, safeStatus);
  }
}

function isProviderMessage(message: ModelMessage): message is { role: 'user' | 'assistant'; content: string } {
  return message.role === 'user' || message.role === 'assistant';
}

function asProviderMessages(messages: ModelMessage[]) {
  return messages.filter(isProviderMessage).map(message => ({ role: message.role, content: message.content }));
}

function toolArguments(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Buffer.byteLength(JSON.stringify(value)) > 16 * 1024) return null;
  return value as Record<string, unknown>;
}

async function executeProviderTool(
  name: string,
  input: unknown,
  tools: AssistantTool[],
  executeTool: AssistantToolExecutor,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return { text: 'Agent execution timed out or was cancelled. No tool call was started.', isError: true };
  const args = toolArguments(input);
  if (!args) return { text: 'Tool arguments must be a JSON object no larger than 16 KB.', isError: true };
  const tool = tools.find(item => item.name === name);
  if (!tool) return { text: 'That tool is not available for this request.', isError: true };
  try {
    return await executeTool(name, args, signal);
  } catch {
    return { text: 'The tool could not be completed. No raw arguments or credentials were logged.', isError: true };
  }
}

export async function generateTextWithTools(
  request: TextGenerationRequest & { tools: AssistantTool[]; executeTool: AssistantToolExecutor; maxToolCalls?: number; requiredToolName?: string },
): Promise<TextGenerationResult> {
  // This execution boundary intentionally supports Gemini only. resolveModel
  // rejects non-Gemini identifiers before any request.
  const resolved = resolveModel(request.model);
  if (resolved.provider !== 'google') {
    throw new ModelProviderError('Only Gemini model execution is enabled. Configure GEMINI_API_KEY.', 503);
  }
  if (!isProviderConfigured('google')) {
    throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY on the server.', 503);
  }
  if (!request.tools.length) return generateText(request);
  if (request.requiredToolName && !request.tools.some(tool => tool.name === request.requiredToolName)) {
    throw new ModelProviderError('The selected tool is not available for this request.', 400);
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '', httpOptions: { timeout: 45_000 } });
  const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
  const contents: Content[] = asProviderMessages(request.messages).map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const definitions = request.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
  }));
  const maxCalls = Math.max(1, Math.min(8, Math.trunc(request.maxToolCalls || 6)));
  const maxTurns = 5;
  let callsMade = 0;
  let toolErrors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolCalls: Array<{ name: string; success: boolean }> = [];
  let usageReported = false;
  let finalText = '';
  const temperature = Math.max(0, Math.min(2, request.temperature ?? 0.3));
  const maxOutputTokens = Math.max(64, Math.min(20_000, Math.trunc(request.maxOutputTokens || 1200)));
  const addUsage = (response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null }) => {
    const usage = response.usageMetadata;
    if (usage?.promptTokenCount !== undefined && usage.candidatesTokenCount !== undefined) {
      usageReported = true;
      totalInputTokens += usage.promptTokenCount;
      totalOutputTokens += usage.candidatesTokenCount;
    }
  };

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await withProviderError('google', resolved.model, () => client.models.generateContent({
      model: resolved.model,
      contents,
      config: {
        maxOutputTokens,
        temperature,
        ...(request.signal ? { abortSignal: request.signal } : {}),
        ...(system ? { systemInstruction: system } : {}),
        tools: [{ functionDeclarations: definitions }],
        ...(request.requiredToolName && callsMade === 0 ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [request.requiredToolName] } } } : {}),
      },
    }), request.signal);
    addUsage(response);
    const candidate = response.candidates?.[0];
    const content = candidate?.content;
    const parts: Part[] = content?.parts || [];
    const text = parts.filter(part => typeof part.text === 'string').map(part => part.text || '').join('').trim();
    const calls = parts.filter(part => part.functionCall).map(part => part.functionCall!).filter(call => typeof call.name === 'string');

    if (candidate?.finishReason === 'MAX_TOKENS' && !calls.length) {
      throw new ModelProviderError('Gemini reached the output-token limit before returning a complete answer. Shorten the request or ask for a smaller result.', 502);
    }
    if (!calls.length) {
      finalText = text;
      break;
    }

    // Keep the model's function-call turn immediately before its matching
    // function responses, as required by Gemini's conversation sequencing.
    if (content) contents.push(content);
    const resultParts: Part[] = [];
    for (const call of calls) {
      callsMade += 1;
      const result = callsMade <= maxCalls
        ? await executeProviderTool(call.name || '', call.args, request.tools, request.executeTool, request.signal)
        : { text: 'Tool-call limit reached. No further tools were executed; summarize completed results and tell the user what remains.', isError: true };
      if (result.isError) toolErrors += 1;
      toolCalls.push({ name: call.name || '', success: !result.isError });
      resultParts.push({
        functionResponse: {
          name: call.name || '',
          ...(call.id ? { id: call.id } : {}),
          response: { result: result.text.slice(0, 12_000), is_error: Boolean(result.isError) },
        },
      });
    }
    contents.push({ role: 'user', parts: resultParts });
  }

  if (request.requiredToolName && callsMade === 0) {
    throw new ModelProviderError('The selected tool was not called. Please retry or choose another approved tool.', 502);
  }

  // If the final permitted tool turn produced no user-facing answer, ask for
  // one text-only synthesis from the already-recorded tool results. This call
  // cannot re-run side effects because no function declarations are supplied.
  if (!finalText && callsMade > 0) {
    const response = await withProviderError('google', resolved.model, () => client.models.generateContent({
      model: resolved.model,
      contents,
      config: {
        maxOutputTokens,
        temperature: 0.2,
        ...(request.signal ? { abortSignal: request.signal } : {}),
        ...(system ? { systemInstruction: system } : {}),
      },
    }), request.signal);
    addUsage(response);
    finalText = (response.text || response.candidates?.[0]?.content?.parts?.filter(part => typeof part.text === 'string').map(part => part.text || '').join('') || '').trim();
  }

  if (!finalText) {
    throw new ModelProviderError(callsMade
      ? `Gemini executed ${callsMade} tool call(s), but could not produce a final answer${toolErrors ? `; ${toolErrors} tool result(s) reported errors` : ''}. The tool results were not re-executed. Retry with a shorter request or inspect the affected tool status before retrying any action.`
      : 'Gemini returned an empty response. Retry once; if it repeats, shorten the request or check provider availability.', 502);
  }
  return {
    text: finalText,
    model: resolved.model,
    provider: 'google',
    usage: usageReported ? normalizeUsage(totalInputTokens, totalOutputTokens) : null,
    toolCalls,
  };
}


/** Streams genuine Gemini output chunks. Once any chunk is emitted, failures are
 * surfaced to the caller rather than retried, avoiding duplicated partial text. */
export async function generateTextStream(
  request: TextGenerationRequest,
  onText: (chunk: string) => void,
): Promise<TextGenerationResult> {
  const resolved = resolveModel(request.model);
  if (resolved.provider !== 'google') throw new ModelProviderError('Only Gemini model execution is enabled. Configure GEMINI_API_KEY.', 503);
  if (!isProviderConfigured('google')) throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY on the server.', 503);

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '', httpOptions: { timeout: 45_000 } });
  const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
  const maxOutputTokens = Math.max(64, Math.min(20_000, Math.trunc(request.maxOutputTokens || 1200)));
  const temperature = Math.max(0, Math.min(2, request.temperature ?? 0.3));
  const stream = await withProviderError('google', resolved.model, () => client.models.generateContentStream({
    model: resolved.model,
    contents: asProviderMessages(request.messages).map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
    config: { maxOutputTokens, temperature, ...(request.signal ? { abortSignal: request.signal } : {}), ...(system ? { systemInstruction: system } : {}) },
  }), request.signal);

  let fullText = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for await (const chunk of stream) {
    if (request.signal?.aborted) throw request.signal.reason ?? new Error('Request aborted');
    const text = chunk.text || '';
    if (text) { fullText += text; onText(text); }
    if (chunk.usageMetadata?.promptTokenCount !== undefined) inputTokens = chunk.usageMetadata.promptTokenCount;
    if (chunk.usageMetadata?.candidatesTokenCount !== undefined) outputTokens = chunk.usageMetadata.candidatesTokenCount;
  }
  return { text: fullText, model: resolved.model, provider: 'google', usage: normalizeUsage(inputTokens, outputTokens), toolCalls: [] };
}

export async function generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
  const resolved = resolveModel(request.model);
  if (resolved.provider !== 'google') {
    throw new ModelProviderError('Only Gemini model execution is enabled. Configure GEMINI_API_KEY.', 503);
  }
  if (!isProviderConfigured('google')) {
    throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY on the server.', 503);
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '', httpOptions: { timeout: 45_000 } });
  const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
  const maxOutputTokens = Math.max(64, Math.min(20_000, Math.trunc(request.maxOutputTokens || 1200)));
  const temperature = Math.max(0, Math.min(2, request.temperature ?? 0.3));
  const response = await withProviderError('google', resolved.model, () => client.models.generateContent({
    model: resolved.model,
    contents: asProviderMessages(request.messages).map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    config: {
      maxOutputTokens,
      temperature,
      ...(request.signal ? { abortSignal: request.signal } : {}),
      ...(system ? { systemInstruction: system } : {}),
      ...(request.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  }), request.signal);
  const usage = response.usageMetadata;
  const grounded = response as typeof response & { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> } }> };
  const sources = (grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk.web)
    .filter((web): web is { title?: string; uri: string } => typeof web?.uri === 'string' && /^https?:\/\//i.test(web.uri))
    .filter((web, index, all) => all.findIndex(item => item.uri === web.uri) === index)
    .slice(0, 8);
  const baseText = (response.text || '').trim();
  const sourceText = sources.length ? `\n\nSources\n${sources.map(source => `- ${source.title || source.uri}: ${source.uri}`).join('\n')}` : '';
  return {
    text: `${baseText}${sourceText}`.trim(),
    model: resolved.model,
    provider: 'google',
    usage: normalizeUsage(usage?.promptTokenCount, usage?.candidatesTokenCount),
    toolCalls: [],
    ...(sources.length ? { sources: sources.map(source => ({ title: source.title, uri: source.uri })) } : {}),
  };
}
