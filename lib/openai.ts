import OpenAI from 'openai';
import { leoCreatorProfile } from '@/data/leo-profile';

function modelTimeout() {
  const configured = Number(process.env.LEO_MODEL_TIMEOUT_MS || 45_000);
  return Number.isFinite(configured) ? Math.max(1_000, Math.min(120_000, Math.trunc(configured))) : 45_000;
}

/** Remote OpenAI-compatible provider for media, realtime, and hosted tools. */
export function getOpenAI(){
  if (process.env.LEO_OFFLINE_MODE === 'true') throw new Error('Hosted provider calls are disabled by LEO_OFFLINE_MODE.');
  const key=process.env.OPENAI_API_KEY || process.env.LEO_API_KEY;
  if(!key) throw new Error('OPENAI_API_KEY or LEO_API_KEY is not configured');
  return new OpenAI({ apiKey:key, timeout:modelTimeout(), maxRetries:1 });
}

/**
 * Text-only provider adapter. Local mode is configured exclusively by the
 * server environment and is never selected using a URL supplied by a caller.
 * The local endpoint must implement OpenAI-compatible /chat/completions; text
 * Responses calls are normalized through that endpoint. Media/realtime still require a provider.
 */
export function getTextOpenAI(){
  const localUrl = process.env.LEO_LOCAL_MODEL_URL?.trim();
  if (!localUrl) return getOpenAI();
  let parsed: URL;
  try { parsed = new URL(localUrl); } catch { throw new Error('LEO_LOCAL_MODEL_URL must be a valid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('LEO_LOCAL_MODEL_URL must use HTTP(S) without embedded credentials');
  }
  return new OpenAI({
    apiKey: process.env.LEO_LOCAL_MODEL_API_KEY || 'local-openai-compatible',
    baseURL: localUrl.replace(/\/+$/, ''),
    timeout: modelTimeout(),
    maxRetries: 1,
  });
}

export function getConfiguredModel(fallback = 'gpt-4o-mini') {
  if (process.env.LEO_LOCAL_MODEL_URL?.trim()) return process.env.LEO_LOCAL_MODEL_NAME?.trim() || 'local-model';
  return process.env.LEO_MEETING_MODEL || process.env.LEO_AGENT_MODEL || fallback;
}

type TextInputMessage = { role: 'system' | 'user' | 'assistant' | 'developer'; content: string | Array<{ type?: string; text?: string }> };
type TextResponseParams = { model: string; input: string | TextInputMessage[]; max_output_tokens?: number; temperature?: number; reasoning?: unknown; tools?: unknown[] };

/** Normalizes local chat-completions-only servers and hosted Responses API into one text result. */
export async function createTextResponse(params: TextResponseParams): Promise<{ output_text: string }> {
  if (process.env.LEO_OFFLINE_MODE === 'true' && !process.env.LEO_LOCAL_MODEL_URL?.trim()) throw new Error('Offline mode requires LEO_LOCAL_MODEL_URL; no hosted fallback is permitted.');
  if (!process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    const response = await getOpenAI().responses.create(params as never);
    return { output_text: response.output_text || '' };
  }
  if (params.tools?.length) throw new Error('Configured local text models do not support hosted tool execution.');
  const rawMessages: TextInputMessage[] = typeof params.input === 'string'
    ? [{ role: 'user', content: params.input }]
    : params.input;
  const messages = rawMessages.map(message => ({
    role: message.role === 'developer' ? 'system' as const : message.role,
    content: typeof message.content === 'string'
      ? message.content
      : message.content.map(part => part.text || '').filter(Boolean).join('\n'),
  }));
  const response = await getTextOpenAI().chat.completions.create({
    model: params.model,
    messages,
    max_tokens: Math.max(64, Math.min(4000, params.max_output_tokens || 1200)),
    temperature: params.temperature ?? 0.3,
  });
  const content = response.choices[0]?.message?.content;
  return { output_text: typeof content === 'string' ? content : '' };
}

export const LEO_PLAN_TERMINOLOGY = "Customer-facing plan names are Free, Standard, Pro, and Business. The legacy stored ID 'unlimited' maps to Business and must not be shown as a plan name.";

export function getLeoSystemPrompt() {
  return LEO_SYSTEM_PROMPT;
}

export const LEO_SYSTEM_PROMPT=`You are Leo, a general assistant inside LEO OS.

You have a verified public creator profile for Leonard Udoh:
${JSON.stringify(leoCreatorProfile, null, 2)}

Use that profile to answer reasonable questions about Leonard, his work, his products and LEO OS. This is not a complete biography. Never fill missing personal details with guesses. If asked about Leonard's private background and the profile does not contain it, say Leo does not have that information yet and ask Leonard to provide it if he wants it remembered.

Help with business, coding, science, math, brainstorming and writing. Be friendly, professional, direct, and globally inclusive; adapt language naturally to the user's region and preferences, including English and other supported languages. Never invent payment, access, deployment, credits or completed actions. Those must be confirmed by backend data. Address the verified owner as Boss Leonard 👑; address other users as sir/ma. Explain free versus paid access and guide users through the real account, subscription and Paystack flows. The live Pricing page is /pricing and its backend pricing endpoint is /api/pricing; when pricing amounts matter, use current account/platform data rather than inventing a number. Leo can explain Standard, Pro and Business plans; professional website/web-app/SaaS building is included as plan-authorized project capability, while hosting after the 90-day deployment trial is a separate hosting renewal. If information must be checked from the account, say you will check it rather than pretending. Signed-in users can have persistent chat history and user-approved Leo memories; when a user explicitly asks Leo to remember something, save only that requested fact and allow it to be managed/deleted later. Do not expose owner email or secrets. If a user asks Leo to build/deploy a website directly from chat, use the existing plan/project/deployment flow when the account is authorized; never pretend a build or deployment happened without a verified backend result. Deployment starts the project hosting trial; hosting after the trial is separate. Ask for real client assets such as names, photos, credentials, testimonials and links when the chosen website type needs them. Never invent those facts. For client-owned website chatbots, require the client to provide their own OpenAI API key; do not promise to use Leo's platform key for the client's billing. For any website needing payments, explain automatic server-verified payment versus manual email payment and let the client choose; never force automatic payment unless they choose it. Do not end every answer with a sales phrase.`;
