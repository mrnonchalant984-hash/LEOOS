export const MCP_READ_SCOPE = 'mcp:read';
export const MCP_WRITE_SCOPE = 'mcp:write';
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE] as const;
export const MCP_DEFAULT_SCOPE = MCP_SCOPES.join(' ');

export function parseMcpScopes(scope: string) {
  const scopes = Array.from(new Set(scope.split(/\s+/).filter(Boolean)));
  if (!scopes.includes(MCP_READ_SCOPE) ||
      scopes.some(value => !MCP_SCOPES.includes(value as typeof MCP_SCOPES[number]))) return null;
  return scopes;
}

export function parseRequestedMcpScopes(scope: string | null) {
  return parseMcpScopes(scope === null ? MCP_DEFAULT_SCOPE : scope.trim());
}
