export type ModelProvider = 'google';
export type ModelMessage = { role: 'system' | 'developer' | 'user' | 'assistant'; content: string };

export class ModelProviderError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'ModelProviderError';
    this.statusCode = statusCode;
  }
}

// Keep the built-in router on models available through the Gemini Developer API
// free tier. Paid-only/preview model IDs must not be selected by defaults or env overrides.
const MODEL_PRESETS: Record<string, { name: string; provider: ModelProvider; model: string; capabilities: string[] }> = {
  'google/gemini-2.5-flash': { name: 'Gemini 2.5 Flash (Free tier)', provider: 'google', model: 'gemini-2.5-flash', capabilities: ['text', 'tools', 'multimodal', 'reasoning', 'web_search'] },
  'google/gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash-Lite (Free tier)', provider: 'google', model: 'gemini-2.5-flash-lite', capabilities: ['text', 'tools', 'multimodal'] },
};

export function normalizeGeminiModelId(modelName: string) { return modelName.trim(); }
function hasConfiguredValue(...values: (string | undefined)[]) { return values.some(value => Boolean(value?.trim())); }
function configuredProvider(provider: ModelProvider): boolean {
  return provider === 'google' && hasConfiguredValue(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
}

export function getModelProviderStatus() {
  return Object.entries(MODEL_PRESETS).map(([id, model]) => ({
    id, name: model.name, provider: model.provider, model: model.model,
    capabilities: model.capabilities, configured: configuredProvider(model.provider),
    tier: 'free' as const,
  }));
}

const SUPPORTED_GEMINI_TEXT_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);

export function resolveModel(modelName: string): { provider: ModelProvider; model: string } {
  const normalized = modelName.trim();
  const preset = MODEL_PRESETS[normalized];
  if (preset) return { provider: preset.provider, model: preset.model };
  const matchingPreset = Object.values(MODEL_PRESETS).find(entry => entry.model === normalized);
  if (matchingPreset) return { provider: matchingPreset.provider, model: matchingPreset.model };
  const separator = normalized.indexOf('/');
  if (separator > 0) {
    const provider = normalized.slice(0, separator);
    const model = normalized.slice(separator + 1);
    if (provider === 'google' && SUPPORTED_GEMINI_TEXT_MODELS.has(model)) return { provider: 'google', model: normalizeGeminiModelId(model) };
    throw new ModelProviderError('Only Gemini Developer API free-tier models are enabled. Select gemini-2.5-flash or gemini-2.5-flash-lite.', 400);
  }
  if (SUPPORTED_GEMINI_TEXT_MODELS.has(normalized)) return { provider: 'google', model: normalizeGeminiModelId(normalized) };
  throw new ModelProviderError('Choose a supported Gemini free-tier model from the configured model registry.', 400);
}

export function getDefaultTextModel(mode: 'chat' | 'reasoning' = 'chat') {
  const configured = mode === 'reasoning'
    ? process.env.LEO_REASONING_MODEL?.trim() || process.env.LEO_CHAT_MODEL?.trim()
    : process.env.LEO_CHAT_MODEL?.trim();
  if (configured) {
    try {
      const configuredId = configured.includes('/') ? configured : `google/${configured}`;
      const resolved = resolveModel(configuredId);
      if (configuredProvider(resolved.provider)) return `${resolved.provider}/${resolved.model}`;
    } catch { /* Ignore paid, retired, or invalid overrides and use the free default. */ }
  }
  if (!configuredProvider('google')) throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY before using Leo chat.', 503);
  // Flash supports reasoning and free-tier Google Search grounding; Lite is the
  // low-cost fallback for ordinary text/tool workloads.
  return mode === 'reasoning' ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-flash';
}

export function isProviderConfigured(provider: ModelProvider) { return configuredProvider(provider); }
