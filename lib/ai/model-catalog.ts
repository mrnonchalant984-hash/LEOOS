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

// Built-in routing is restricted to Gemini Developer API models with free-tier
// inference. 2.5 Flash-Lite retains free Google Search grounding; 3.5 Flash-Lite
// is the default general-purpose agent model.
const MODEL_PRESETS: Record<string, { name: string; provider: ModelProvider; model: string; capabilities: string[] }> = {
  'google/gemini-3.5-flash-lite': { name: 'Gemini 3.5 Flash-Lite (Free tier)', provider: 'google', model: 'gemini-3.5-flash-lite', capabilities: ['text', 'tools', 'multimodal'] },
  'google/gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash-Lite (Free tier + Search)', provider: 'google', model: 'gemini-2.5-flash-lite', capabilities: ['text', 'tools', 'multimodal', 'web_search'] },
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

const SUPPORTED_GEMINI_TEXT_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite']);

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
    throw new ModelProviderError('Only supported free-tier Gemini models are enabled. Choose gemini-3.5-flash-lite or gemini-2.5-flash-lite.', 400);
  }
  if (SUPPORTED_GEMINI_TEXT_MODELS.has(normalized)) return { provider: 'google', model: normalizeGeminiModelId(normalized) };
  throw new ModelProviderError('Choose a supported model from the free-tier Gemini model registry.', 400);
}

export function getDefaultTextModel(mode: 'chat' | 'reasoning' | 'research' = 'chat') {
  if (mode === 'research') {
    if (!configuredProvider('google')) throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY before using Research.', 503);
    return 'google/gemini-2.5-flash-lite';
  }
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
  return 'google/gemini-3.5-flash-lite';
}

export function isProviderConfigured(provider: ModelProvider) { return configuredProvider(provider); }
