export type ModelCatalogItem = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
  provider?: unknown;
  capabilities?: unknown;
  configured?: unknown;
};

export type LeoModelOption = {
  id: string;
  name: string;
  model: string;
  provider: string;
};

export function getConfiguredTextModels(models: ModelCatalogItem[] | undefined): LeoModelOption[] {
  if (!models) return [];
  return models.flatMap(model => {
    if (model.configured !== true || typeof model.id !== 'string' || typeof model.name !== 'string'
      || typeof model.model !== 'string' || model.provider !== 'google'
      || !Array.isArray(model.capabilities) || !model.capabilities.includes('text')) {
      return [];
    }
    return [{ id: model.id, name: model.name, model: model.model, provider: model.provider }];
  });
}

export function modelDisplayName(model: LeoModelOption) {
  const family = model.provider === 'google' ? 'Gemini' : model.provider;
  return `${family} · ${model.model} (${model.name})`;
}