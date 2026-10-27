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
  'openai/gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', capabilities: ['text', 'tools', 'multimodal'] },
  'openai/gpt-5.6-luna': { provider: 'openai', model: 'gpt-5.6-luna', capabilities: ['text', 'tools', 'multimodal'] },
  'anthropic/claude-3-5-haiku-latest': { provider: 'anthropic', model: 'claude-3-5-haiku-latest', capabilities: ['text', 'tools'] },
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

  // Accept an unqualified model name only when it maps to a reviewed preset.
  const matchingPreset = Object.values(MODEL_PRESETS).find(entry => entry.model === normalized);
  if (matchingPreset) return { provider: matchingPreset.provider, model: matchingPreset.model };

  const separator = normalized.indexOf('/');
  if (separator > 0) {
    const provider = normalized.slice(0, separator) as ModelProvider;
    const model = normalized.slice(separator + 1);
    if ((provider === 'google' || provider === 'openai' || provider === 'anthropic' || provider === 'local') && MODEL_ID_RE.test(model)) {
      if (provider === 'google' && model.startsWith('gemini-')) return { provider, model: normalizeGeminiModelId(model) };
      if (provider === 'local' && model.length > 0) return { provider, model };
    }
  } else if (MODEL_ID_RE.test(normalized)) {
    if (normalized.startsWith('gemini-')) return { provider: 'google', model: normalizeGeminiModelId(normalized) };
    if (normalized === 'gpt-4o-mini') return { provider: 'openai', model: normalized };
  }
  throw new ModelProviderError('Choose a supported model from the configured model registry.', 400);
}

export function getDefaultTextModel(mode: 'chat' | 'reasoning' = 'chat') {
  // An explicitly configured local endpoint is an intentional opt-out of hosted inference.
  if (process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    const localName = process.env.LEO_LOCAL_MODEL_NAME?.trim() || 'local-model';
    if (MODEL_ID_RE.test(localName)) return `local/${localName}`;
  }

  const configured = mode === 'reasoning'
    ? process.env.LEO_REASONING_MODEL?.trim() || process.env.LEO_CHAT_MODEL?.trim()
    : process.env.LEO_CHAT_MODEL?.trim();
  if (configured) {
    try {
      const configuredId = configured.includes('/') ? configured : `google/${configured}`;
      const resolved = resolveModel(configuredId);
      // Gemini is the default product policy. Other providers remain explicit-only
      // and cannot become the default merely because their credentials are present.
      if (resolved.provider === 'google') return `${resolved.provider}/${resolved.model}`;
    } catch { /* stale or unsupported values safely fall through to Gemini */ }
  }

  // Return the stable product default even when the key is absent. The execution
  // boundary performs the configured-provider check and returns a clear 503; this
  // keeps model resolution deterministic for settings, status and UI rendering.
  return 'google/gemini-3.8-flash';
}

export function isProviderConfigured(provider: ModelProvider) {
  return configuredProvider(provider);
}
