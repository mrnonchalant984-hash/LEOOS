export type BravertonMcpTool = {
  name: string;
  description?: string;
  inputSchema?: object;
  approved: boolean;
};

export type BravertonMcpServer = {
  id: string;
  name: string;
  tools: BravertonMcpTool[];
};

export type BravertonMcpCallInput = {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBravertonMcpServers(value: unknown): BravertonMcpServer[] {
  if (!isRecord(value) || !Array.isArray(value.servers)) {
    throw new Error('Braverton returned an invalid MCP server catalog.');
  }

  return value.servers.flatMap((server): BravertonMcpServer[] => {
    if (!isRecord(server) || server.enabled !== true || typeof server.id !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(server.id) || typeof server.name !== 'string') {
      return [];
    }

    const tools = Array.isArray(server.tools) ? server.tools.flatMap((tool): BravertonMcpTool[] => {
      if (!isRecord(tool) || typeof tool.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) {
        return [];
      }
      return [{
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description.slice(0, 1000) : undefined,
        inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : undefined,
        approved: tool.approved === true,
      }];
    }) : [];

    return [{ id: server.id, name: server.name.slice(0, 160), tools }];
  });
}

export function parseBravertonMcpCallInput(value: unknown): BravertonMcpCallInput {
  if (!isRecord(value) || typeof value.serverId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.serverId)
    || typeof value.toolName !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.toolName)
    || !isRecord(value.arguments)) {
    throw new Error('Provide a valid Braverton MCP server, tool name, and arguments object.');
  }

  const serialized = JSON.stringify(value.arguments);
  if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) {
    throw new Error('MCP tool arguments must not exceed 16 KB.');
  }

  return { serverId: value.serverId, toolName: value.toolName, arguments: value.arguments };
}

export function findApprovedBravertonMcpTool(
  servers: readonly BravertonMcpServer[],
  serverId: string,
  toolName: string,
) {
  const server = servers.find(item => item.id === serverId);
  const tool = server?.tools.find(item => item.name === toolName);
  return server && tool?.approved ? { server, tool } : undefined;
}
