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

const MODEL_PRESETS: Record<string, { name: string; provider: ModelProvider; model: string; capabilities: string[] }> = {
  'google/gemini-4-argon': { name: 'LEO Argon', provider: 'google', model: 'gemini-4-argon', capabilities: ['text', 'tools', 'reasoning'] },
  'google/gemini-3.8-flash': { name: 'LEO Flash', provider: 'google', model: 'gemini-3.8-flash', capabilities: ['text', 'tools', 'multimodal'] },
  'google/gemini-3.1-pro-preview': { name: 'LEO Pro', provider: 'google', model: 'gemini-3.1-pro-preview', capabilities: ['text', 'tools', 'reasoning'] },
  'google/gemini-3.1-flash-lite': { name: 'LEO Flash Lite', provider: 'google', model: 'gemini-3.1-flash-lite', capabilities: ['text', 'tools'] },
  'google/gemini-2.5-pro': { name: 'LEO Classic Pro', provider: 'google', model: 'gemini-2.5-pro', capabilities: ['text', 'tools', 'reasoning'] },
};

// Do not silently map retired model IDs to a different model: callers should
// receive an explicit configuration error instead of an unexpected model swap.
export function normalizeGeminiModelId(modelName: string) {
  return modelName.trim();
}

function hasConfiguredValue(...values: (string | undefined)[]) {
  return values.some(value => Boolean(value?.trim()));
}

function configuredProvider(provider: ModelProvider): boolean {
  return provider === 'google' && hasConfiguredValue(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
}

export function getModelProviderStatus() {
  return Object.entries(MODEL_PRESETS).map(([id, model]) => ({
    id,
    name: model.name,
    provider: model.provider,
    model: model.model,
    capabilities: model.capabilities,
    configured: configuredProvider(model.provider),
  }));
}

const SUPPORTED_GEMINI_TEXT_MODELS = new Set([
  'gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite', 'gemini-2.5-pro',
  'gemini-2.5-flash', 'gemini-2.5-flash-lite',
]);

export function resolveModel(modelName: string): { provider: ModelProvider; model: string } {
  const normalized = modelName.trim();
  const preset = MODEL_PRESETS[normalized];
  if (preset) return { provider: preset.provider, model: preset.model };

  // Accept an unqualified model name only when it uniquely matches a known preset.
  // This keeps UI/environment aliases interoperable without allowing arbitrary IDs.
  const matchingPreset = Object.values(MODEL_PRESETS).find(entry => entry.model === normalized);
  if (matchingPreset) return { provider: matchingPreset.provider, model: matchingPreset.model };

  const separator = normalized.indexOf('/');
  if (separator > 0) {
    const provider = normalized.slice(0, separator);
    const model = normalized.slice(separator + 1);
    if (provider === 'google' && SUPPORTED_GEMINI_TEXT_MODELS.has(model)) {
      return { provider: 'google', model: normalizeGeminiModelId(model) };
    }
    throw new ModelProviderError('Only Gemini models are enabled in this deployment. Configure GEMINI_API_KEY and select a supported Gemini model.', 400);
  } else if (SUPPORTED_GEMINI_TEXT_MODELS.has(normalized)) {
    return { provider: 'google', model: normalizeGeminiModelId(normalized) };
  }
  throw new ModelProviderError('Choose a supported model from the configured model registry.', 400);
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
    } catch { /* stale configuration falls through to the first configured model */ }
  }

  // Gemini is the only model provider allowed by the centralized registry.
  const preferred = mode === 'reasoning'
    ? ['google/gemini-4-argon', 'google/gemini-3.1-pro-preview']
    : ['google/gemini-3.8-flash', 'google/gemini-3.1-flash-lite'];
  const available = preferred.find(id => {
    const preset = MODEL_PRESETS[id];
    return preset && configuredProvider(preset.provider);
  });
  if (available) return available;
  throw new ModelProviderError('Gemini is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY before using Leo chat.', 503);
}

export function isProviderConfigured(provider: ModelProvider) {
  return configuredProvider(provider);
}
