function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function mcpToolsNeedingReapproval(previous: unknown[], current: unknown[]) {
  const currentByName = new Map<string, Record<string, unknown>>();
  for (const item of current) {
    const tool = record(item);
    if (typeof tool?.name === 'string') currentByName.set(tool.name, tool);
  }
  const changed: string[] = [];
  for (const item of previous) {
    const tool = record(item);
    if (typeof tool?.name !== 'string') continue;
    const updated = currentByName.get(tool.name);
    if (!updated || stableJson(tool) !== stableJson(updated)) changed.push(tool.name);
  }
  return changed;
}
