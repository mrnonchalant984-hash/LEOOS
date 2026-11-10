import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSafeMcpFetch, validateMcpEndpointUrl } from '@/lib/mcp/outbound-security';
import { isValidMcpToolInputSchema, validateMcpToolArguments } from '@/lib/mcp/tool-arguments';

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

function createRemoteClient(endpoint: string, bearerToken: string | undefined, protocol: 'streamable' | 'sse') {
  const url = validateMcpEndpointUrl(endpoint);
  const safeFetch = createSafeMcpFetch(endpoint, bearerToken, protocol === 'sse');
  const transport = protocol === 'streamable'
    ? new StreamableHTTPClientTransport(url, {
        fetch: safeFetch,
        redirectPolicy: 'same-origin',
        requestInit: { redirect: 'error' },
      })
    : new SSEClientTransport(url, {
        fetch: safeFetch,
        eventSourceInit: { fetch: safeFetch },
        redirectPolicy: 'same-origin',
        requestInit: { redirect: 'error' },
      });
  const client = new Client({ name: 'LeonardX MCP client', version: '1.0.0' }, { capabilities: {} });
  return { client, transport };
}

async function connectRemoteClient(endpoint: string, bearerToken?: string) {
  let lastError: unknown;
  for (const protocol of ['streamable', 'sse'] as const) {
    const { client, transport } = createRemoteClient(endpoint, bearerToken, protocol);
    try {
      await client.connect(transport);
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.close();
      } catch (closeError) {
        console.error('Failed to close an unsuccessful remote MCP connection', {
          protocol,
          error: closeError instanceof Error ? closeError.message : 'unknown',
        });
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The MCP server does not support a configured transport.');
}

export async function discoverMcpTools(endpoint: string, bearerToken?: string): Promise<DiscoveredMcpTool[]> {
  const client = await connectRemoteClient(endpoint, bearerToken);
  try {
    const result = await client.listTools();
    if (result.tools.length > 50) throw new Error('The remote MCP server returned more than 50 tools.');
    const seenNames = new Set<string>();
    return result.tools.map(tool => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) throw new Error('The remote MCP server returned an invalid tool name.');
      if (seenNames.has(tool.name)) throw new Error('The remote MCP server returned duplicate tool names.');
      seenNames.add(tool.name);
      const inputSchema = tool.inputSchema as Record<string, unknown>;
      if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
        throw new Error(`The remote MCP tool "${tool.name}" has an invalid or oversized input schema.`);
      }
      const schemaSize = Buffer.byteLength(JSON.stringify(inputSchema));
      if (schemaSize > 24 * 1024) throw new Error(`The remote MCP tool "${tool.name}" has an invalid or oversized input schema.`);
      if (!isValidMcpToolInputSchema(inputSchema)) throw new Error(`The remote MCP tool "${tool.name}" has an invalid input schema.`);
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

export async function callMcpTool(
  endpoint: string,
  bearerToken: string | undefined,
  name: string,
  args: Record<string, unknown>,
  inputSchema: unknown,
  signal?: AbortSignal,
) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error('The requested MCP tool name is invalid.');
  if (Buffer.byteLength(JSON.stringify(args)) > 16 * 1024) throw new Error('MCP tool arguments exceed the allowed size.');
  if (!validateMcpToolArguments(inputSchema, args)) throw new Error('MCP tool arguments do not match the discovered input schema.');
  const client = await connectRemoteClient(endpoint, bearerToken);
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, signal ? { signal } : undefined);
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
