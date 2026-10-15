import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { getOpenAI, getTextOpenAI } from '@/lib/openai';
import { ModelProviderError, isProviderConfigured, resolveModel, type ModelMessage, type ModelProvider } from './model-catalog';
import type { Content, Part } from '@google/genai';

export { getDefaultTextModel, getModelProviderStatus, ModelProviderError, resolveModel } from './model-catalog';
export type { ModelMessage, ModelProvider } from './model-catalog';
export type TextGenerationRequest = {
  model: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  reasoning?: { effort: 'low' | 'medium' | 'high' };
};
export type TextGenerationResult = {
  text: string;
  model: string;
  provider: ModelProvider;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
};
export type AssistantTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type AssistantToolExecutor = (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;

function normalizeUsage(inputTokens?: number | null, outputTokens?: number | null) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  const input = Math.max(0, Math.trunc(inputTokens || 0));
  const output = Math.max(0, Math.trunc(outputTokens || 0));
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
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
) {
  const args = toolArguments(input);
  if (!args) return { text: 'Tool arguments must be a JSON object no larger than 16 KB.', isError: true };
  const tool = tools.find(item => item.name === name);
  if (!tool) return { text: 'That tool is not available for this request.', isError: true };
  try {
    return await executeTool(name, args);
  } catch {
    return { text: 'The tool could not be completed. No raw arguments or credentials were logged.', isError: true };
  }
}

function providerTools(tools: AssistantTool[]) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as OpenAI.Chat.Completions.ChatCompletionFunctionTool['function']['parameters'],
    },
  }));
}

export async function generateTextWithTools(
  request: TextGenerationRequest & { tools: AssistantTool[]; executeTool: AssistantToolExecutor; maxToolCalls?: number },
): Promise<TextGenerationResult> {
  const resolved = resolveModel(request.model);
  if (!isProviderConfigured(resolved.provider)) {
    const environmentName = resolved.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : resolved.provider === 'google' ? 'GEMINI_API_KEY or GOOGLE_API_KEY'
        : resolved.provider === 'local' ? 'LEO_LOCAL_MODEL_URL' : 'OPENAI_API_KEY or LEO_API_KEY';
    throw new ModelProviderError(`${resolved.provider} is not configured. Set ${environmentName} on the server.`, 503);
  }
  if (resolved.provider === 'local') throw new ModelProviderError('Tool orchestration is not supported by the configured local model endpoint.', 400);
  if (!request.tools.length) return generateText(request);
  const maxCalls = Math.max(1, Math.min(8, Math.trunc(request.maxToolCalls || 6)));
  const maxTurns = 5;
  let callsMade = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let usageReported = false;
  let finalText = '';
  const temperature = Math.max(0, Math.min(2, request.temperature ?? 0.3));
  const maxOutputTokens = Math.max(64, Math.min(4000, Math.trunc(request.maxOutputTokens || 1200)));

    if (resolved.provider === 'openai') {
      const client = getOpenAI();
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = request.messages.map(message => ({
        role: message.role === 'developer' ? 'system' : message.role,
        content: message.content,
      }));
      const definitions = providerTools(request.tools);
      for (let turn = 0; turn < maxTurns; turn += 1) {
        const response = await client.chat.completions.create({
          model: resolved.model,
          messages,
          tools: definitions,
          tool_choice: 'auto',
          temperature,
          max_tokens: maxOutputTokens,
        });
        const message = response.choices[0]?.message;
        finalText = message?.content || '';
        if (response.usage) {
          usageReported = true;
          totalInputTokens += response.usage.prompt_tokens;
          totalOutputTokens += response.usage.completion_tokens;
        }
        const calls = message?.tool_calls || [];
        if (!calls.length) break;
        messages.push(message);
        for (const call of calls) {
          if (call.type !== 'function') continue;
          callsMade += 1;
          const args = (() => {
            try { return JSON.parse(call.function.arguments) as unknown; } catch { return null; }
          })();
          const result = callsMade <= maxCalls
            ? await executeProviderTool(call.function.name, args, request.tools, request.executeTool)
            : { text: 'The maximum tool-call limit has been reached.', isError: true };
          messages.push({ role: 'tool', tool_call_id: call.id, content: result.text });
        }
      }
    } else if (resolved.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
      const messages: Anthropic.MessageParam[] = asProviderMessages(request.messages).map(message => ({ ...message }));
      const definitions: Anthropic.Tool[] = request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
      }));
      for (let turn = 0; turn < maxTurns; turn += 1) {
        const response = await client.messages.create({
          model: resolved.model,
          max_tokens: maxOutputTokens,
          temperature,
          ...(system ? { system } : {}),
          messages,
          tools: definitions,
        });
        finalText = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
        usageReported = true;
        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;
        const calls = response.content.filter(block => block.type === 'tool_use');
        if (!calls.length) break;
        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of calls) {
          callsMade += 1;
          const result = callsMade <= maxCalls
            ? await executeProviderTool(call.name, call.input, request.tools, request.executeTool)
            : { text: 'The maximum tool-call limit has been reached.', isError: true };
          results.push({ type: 'tool_result', tool_use_id: call.id, content: result.text, is_error: result.isError });
        }
        messages.push({ role: 'user', content: results });
      }
    } else {
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
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
      for (let turn = 0; turn < maxTurns; turn += 1) {
        const response = await client.models.generateContent({
          model: resolved.model,
          contents,
          config: {
            maxOutputTokens,
            temperature,
            ...(system ? { systemInstruction: system } : {}),
            tools: [{ functionDeclarations: definitions }],
          },
        });
        const content = response.candidates?.[0]?.content;
        const parts: Part[] = content?.parts || [];
        finalText = parts.filter(part => typeof part.text === 'string').map(part => part.text || '').join('');
        const usage = response.usageMetadata;
        if (usage?.promptTokenCount !== undefined && usage.candidatesTokenCount !== undefined) {
          usageReported = true;
          totalInputTokens += usage.promptTokenCount;
          totalOutputTokens += usage.candidatesTokenCount;
        }
        const calls = parts.filter(part => part.functionCall).map(part => part.functionCall!).filter(call => typeof call.name === 'string');
        if (!calls.length || !content) break;
        contents.push(content);
        const resultParts: Part[] = [];
        for (const call of calls) {
          callsMade += 1;
          const result = callsMade <= maxCalls
            ? await executeProviderTool(call.name || '', call.args, request.tools, request.executeTool)
            : { text: 'The maximum tool-call limit has been reached.', isError: true };
          resultParts.push({
            functionResponse: {
              name: call.name || '',
              ...(call.id ? { id: call.id } : {}),
              response: { result: result.text, is_error: Boolean(result.isError) },
            },
          });
        }
        contents.push({ role: 'user', parts: resultParts });
      }
    }

    return {
      text: finalText || (callsMade ? 'The read-only tools completed, but the model did not provide a final text response.' : 'I could not generate a reply.'),
      model: resolved.model,
      provider: resolved.provider,
      usage: usageReported ? normalizeUsage(totalInputTokens, totalOutputTokens) : null,
    };
}

export async function generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
  const resolved = resolveModel(request.model);
  if (!isProviderConfigured(resolved.provider)) {
    const environmentName = resolved.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : resolved.provider === 'google' ? 'GEMINI_API_KEY or GOOGLE_API_KEY'
        : resolved.provider === 'local' ? 'LEO_LOCAL_MODEL_URL' : 'OPENAI_API_KEY or LEO_API_KEY';
    throw new ModelProviderError(`${resolved.provider} is not configured. Set ${environmentName} on the server.`, 503);
  }
  const maxOutputTokens = Math.max(64, Math.min(4000, Math.trunc(request.maxOutputTokens || 1200)));
  const temperature = Math.max(0, Math.min(2, request.temperature ?? 0.3));

  if (resolved.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
    const response = await client.messages.create({
      model: resolved.model,
      max_tokens: maxOutputTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: asProviderMessages(request.messages),
    });
    const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
    return {
      text,
      model: response.model,
      provider: resolved.provider,
      usage: normalizeUsage(response.usage.input_tokens, response.usage.output_tokens),
    };
  }

  if (resolved.provider === 'google') {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
    const system = request.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => message.content).join('\n\n');
    const response = await client.models.generateContent({
      model: resolved.model,
      contents: asProviderMessages(request.messages).map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      config: {
        maxOutputTokens,
        temperature,
        ...(system ? { systemInstruction: system } : {}),
      },
    });
    const usage = response.usageMetadata;
    return {
      text: response.text || '',
      model: resolved.model,
      provider: resolved.provider,
      usage: normalizeUsage(usage?.promptTokenCount, usage?.candidatesTokenCount),
    };
  }

  const client: OpenAI = resolved.provider === 'local' ? getTextOpenAI() : getOpenAI();
  if (request.reasoning && resolved.provider === 'openai' && !process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    const response = await client.responses.create({
      model: resolved.model,
      reasoning: request.reasoning,
      input: request.messages.map(message => ({
        role: message.role === 'developer' ? 'system' as const : message.role,
        content: [{ type: 'input_text' as const, text: message.content }],
      })),
      max_output_tokens: maxOutputTokens,
    });
    return {
      text: response.output_text || '',
      model: resolved.model,
      provider: resolved.provider,
      usage: normalizeUsage(response.usage?.input_tokens, response.usage?.output_tokens),
    };
  }

  if (resolved.provider === 'local' && process.env.LEO_OFFLINE_MODE === 'true' && !process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    throw new ModelProviderError('Offline mode requires LEO_LOCAL_MODEL_URL; no hosted fallback is permitted.', 503);
  }
  const response = await client.chat.completions.create({
    model: resolved.model,
    messages: request.messages.map(message => ({
      role: message.role === 'developer' ? 'system' as const : message.role,
      content: message.content,
    })),
    max_tokens: maxOutputTokens,
    temperature,
  });
  const resultUsage = response.usage;
  return {
    text: response.choices[0]?.message?.content || '',
    model: response.model,
    provider: resolved.provider,
    usage: normalizeUsage(resultUsage?.prompt_tokens, resultUsage?.completion_tokens),
  };
}
