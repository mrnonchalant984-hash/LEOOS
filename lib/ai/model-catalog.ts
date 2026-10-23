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
  'openai/gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', capabilities: ['text', 'tools'] },
  'openai/gpt-5.6-luna': { provider: 'openai', model: 'gpt-5.6-luna', capabilities: ['text', 'reasoning'] },
  'anthropic/claude-3-5-haiku-latest': { provider: 'anthropic', model: 'claude-3-5-haiku-latest', capabilities: ['text', 'tools'] },
  'google/gemini-3.8-flash': { provider: 'google', model: 'gemini-3.8-flash', capabilities: ['text', 'tools', 'multimodal'] },
};

const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash': 'gemini-3.8-flash',
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
    if (provider === 'local' && configuredProvider('local') && model === (process.env.LEO_LOCAL_MODEL_NAME?.trim() || 'local-model')) return { provider, model };
    if (['openai', 'anthropic', 'google'].includes(provider) && MODEL_ID_RE.test(model)) {
      return { provider, model: provider === 'google' ? normalizeGeminiModelId(model) : model };
    }
  } else if (MODEL_ID_RE.test(normalized)) {
    // Google AI Studio model IDs are normally unqualified (e.g. gemini-3.8-flash).
    // Resolve them as Google models instead of silently reverting to OpenAI.
    if (normalized.startsWith('gemini-')) return { provider: 'google', model: normalizeGeminiModelId(normalized) };
    const customModel = [process.env.LEO_AGENT_MODEL, process.env.LEO_MEETING_MODEL, process.env.LEO_REASONING_MODEL]
      .find(value => value?.trim() === normalized);
    if (customModel) return { provider: 'openai', model: normalized };
  }
  throw new ModelProviderError('Choose a supported model from the configured model registry.', 400);
}

export function getDefaultTextModel(mode: 'chat' | 'reasoning' = 'chat') {
  if (process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    return `local/${process.env.LEO_LOCAL_MODEL_NAME?.trim() || 'local-model'}`;
  }
  const configured = mode === 'reasoning'
    ? process.env.LEO_REASONING_MODEL?.trim()
    : process.env.LEO_CHAT_MODEL?.trim() || process.env.LEO_MEETING_MODEL?.trim() || process.env.LEO_AGENT_MODEL?.trim();
  // If Gemini is the only configured hosted provider, select it directly instead
  // of deliberately calling an unconfigured OpenAI endpoint and hoping a retry fires.
  const hasOpenAI = configuredProvider('openai');
  const hasGemini = configuredProvider('google');
  const configuredGeminiModel = process.env.LEO_CHAT_MODEL?.trim().replace(/^google\//, '');
  const safeDefault = !hasOpenAI && hasGemini
    ? `google/${configuredGeminiModel?.startsWith('gemini-') ? configuredGeminiModel : 'gemini-3.8-flash'}`
    : mode === 'reasoning' ? 'openai/gpt-5.6-luna' : 'openai/gpt-4o-mini';
  if (!configured) return safeDefault;
  const candidate = configured.includes('/')
    ? configured
    : (MODEL_PRESETS[`openai/${configured}`] ? `openai/${configured}` : configured);
  try {
    const resolved = resolveModel(candidate);
    return `${resolved.provider}/${resolved.model}`;
  } catch {
    // A stale/unsupported deployment env value should not make the entire chat unusable.
    // Fall back to the documented default and leave provider failures to the provider layer.
    return safeDefault;
  }
}

export function isProviderConfigured(provider: ModelProvider) {
  return configuredProvider(provider);
}
