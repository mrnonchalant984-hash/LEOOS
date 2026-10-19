import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const base = process.env.LEONARDX_MCP_URL?.replace(/\/$/, '');
const token = process.env.LEONARDX_MCP_ACCESS_TOKEN;
if (!base || !token) {
  console.error('Set LEONARDX_MCP_URL (the public /mcp URL) and LEONARDX_MCP_ACCESS_TOKEN (a short-lived mcp:read OAuth token).');
  process.exit(2);
}
const endpoint = new URL(base);
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  console.error('Refusing MCP smoke test: LEONARDX_MCP_URL must be a public HTTPS endpoint without embedded credentials.');
  process.exit(2);
}

const client = new Client({ name: 'leonardx-external-mcp-smoke', version: '1.0.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of ['discover_application_capabilities', 'get_android_build_capabilities']) {
    if (!names.has(name)) throw new Error(`Deployed MCP did not advertise ${name}.`);
  }
  const result = await client.callTool({ name: 'get_android_build_capabilities', arguments: {} });
  if (result.isError) throw new Error('Deployed MCP capability invocation returned an MCP tool error.');
  console.log(JSON.stringify({
    endpoint: endpoint.origin + endpoint.pathname,
    protocol: 'Streamable HTTP',
    discovered_tool_count: tools.length,
    required_tools: ['discover_application_capabilities', 'get_android_build_capabilities'],
    capability_result: result.content,
    invocation: 'passed',
    chatgpt_end_to_end_verified: false,
  }, null, 2));
} catch (error) {
  console.error(`External MCP smoke test failed: ${error instanceof Error ? error.message : 'request_failed'}`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
