export type DeveloperAgentInput = {
  name: string;
  description: string;
  instructions: string;
  allowed_tools: string[];
};

export function parseDeveloperAgentInput(input: unknown): DeveloperAgentInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name.trim().length < 3 || value.name.trim().length > 50
    || typeof value.description !== 'string' || value.description.trim().length < 1 || value.description.trim().length > 200
    || typeof value.instructions !== 'string' || value.instructions.trim().length < 30 || value.instructions.trim().length > 4000
    || !Array.isArray(value.allowed_tools) || value.allowed_tools.length > 8
    || !value.allowed_tools.every(tool => typeof tool === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(tool))) return null;
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    instructions: value.instructions.trim(),
    allowed_tools: [...new Set(value.allowed_tools as string[])],
  };
}
