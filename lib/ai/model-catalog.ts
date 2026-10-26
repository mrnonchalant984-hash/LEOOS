export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'local';
export type ModelMessage = { role: 'system' | 'developer' | 'user' | 'assistant'; content: string };

export class ModelProviderError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'ModelProviderError';
    this.statusCode = statusCode;
  }
}

const MODEL_PRESETS: Record<string, { provider: ModelProvider; model: string; capabilities: string[] }> = {
  'google/gemini-3.8-flash': { provider: 'google', model: 'gemini-3.8-flash', capabilities: ['text', 'tools', 'multimodal'] },
};

const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
};

export function normalizeGeminiModelId(modelName: string) {
  const normalized = modelName.trim();
  return GEMINI_MODEL_ALIASES[normalized] || normalized;
}

function hasConfiguredValue(...values: (string | undefined)[]) {
  return values.some(value => Boolean(value?.trim()));
}

function configuredProvider(provider: ModelProvider): boolean {
  if (provider === 'openai') return hasConfiguredValue(process.env.OPENAI_API_KEY, process.env.LEO_API_KEY) && process.env.LEO_OFFLINE_MODE !== 'true';
  if (provider === 'anthropic') return hasConfiguredValue(process.env.ANTHROPIC_API_KEY);
  if (provider === 'google') return hasConfiguredValue(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
  return Boolean(process.env.LEO_LOCAL_MODEL_URL?.trim());
}

export function getModelProviderStatus() {
  return Object.entries(MODEL_PRESETS).map(([id, model]) => ({
    id,
    provider: model.provider,
    model: model.model,
    capabilities: model.capabilities,
    configured: configuredProvider(model.provider),
  }));
}

const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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
    const provider = normalized.slice(0, separator) as ModelProvider;
    const model = normalized.slice(separator + 1);
    if (provider === 'google' && MODEL_ID_RE.test(model)) {
      return { provider, model: provider === 'google' ? normalizeGeminiModelId(model) : model };
    }
  } else if (MODEL_ID_RE.test(normalized)) {
    // Google AI Studio model IDs are normally unqualified (e.g. gemini-3.8-flash).
    // Resolve them as Google models instead of silently reverting to OpenAI.
    if (normalized.startsWith('gemini-')) return { provider: 'google', model: normalizeGeminiModelId(normalized) };
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

  // Gemini remains preferred when it is actually configured. Otherwise choose
  // the first configured catalog entry; never manufacture an unavailable model.
  const preferred = ['google/gemini-3.8-flash'];
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
