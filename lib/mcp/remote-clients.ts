import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSafeMcpFetch, validateMcpEndpointUrl } from '@/lib/mcp/outbound-security';

export type DiscoveredMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

function createRemoteClient(endpoint: string, bearerToken?: string) {
  const url = validateMcpEndpointUrl(endpoint);
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: createSafeMcpFetch(endpoint, bearerToken),
    redirectPolicy: 'same-origin',
    requestInit: { redirect: 'error' },
  });
  const client = new Client({ name: 'LeonardX MCP client', version: '1.0.0' }, { capabilities: {} });
  return { client, transport };
}

export async function discoverMcpTools(endpoint: string, bearerToken?: string): Promise<DiscoveredMcpTool[]> {
  const { client, transport } = createRemoteClient(endpoint, bearerToken);
  try {
    await client.connect(transport);
    const result = await client.listTools();
    if (result.tools.length > 50) throw new Error('The remote MCP server returned more than 50 tools.');
    return result.tools.map(tool => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) throw new Error('The remote MCP server returned an invalid tool name.');
      const inputSchema = tool.inputSchema as Record<string, unknown>;
      const schemaSize = Buffer.byteLength(JSON.stringify(inputSchema));
      if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema) || schemaSize > 24 * 1024) {
        throw new Error(`The remote MCP tool "${tool.name}" has an invalid or oversized input schema.`);
      }
      return {
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description.slice(0, 2000) : '',
        inputSchema,
        annotations: {
          ...(typeof tool.annotations?.readOnlyHint === 'boolean' ? { readOnlyHint: tool.annotations.readOnlyHint } : {}),
          ...(typeof tool.annotations?.destructiveHint === 'boolean' ? { destructiveHint: tool.annotations.destructiveHint } : {}),
          ...(typeof tool.annotations?.openWorldHint === 'boolean' ? { openWorldHint: tool.annotations.openWorldHint } : {}),
        },
      };
    });
  } finally {
    await client.close();
  }
}

export async function callMcpTool(endpoint: string, bearerToken: string | undefined, name: string, args: Record<string, unknown>) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error('The requested MCP tool name is invalid.');
  if (Buffer.byteLength(JSON.stringify(args)) > 16 * 1024) throw new Error('MCP tool arguments exceed the allowed size.');
  const { client, transport } = createRemoteClient(endpoint, bearerToken);
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    const text = Array.isArray(result.content)
      ? result.content.flatMap(item => item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string' ? [item.text] : []).join('\n')
      : '';
    return {
      isError: Boolean(result.isError),
      text: text.slice(0, 64 * 1024),
    };
  } finally {
    await client.close();
  }
}
