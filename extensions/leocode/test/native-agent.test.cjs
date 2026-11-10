const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  findApprovedLeonardXMcpTool,
  parseLeonardXMcpCallInput,
  parseLeonardXMcpServers,
} = require('../out/tools/mcp-contract.js');

const extensionRoot = path.resolve(__dirname, '..');

test('LeoCode is contributed as a selectable VS Code custom agent', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  const agentPath = manifest.contributes.chatAgents[0].path;
  const agent = fs.readFileSync(path.join(extensionRoot, agentPath.replace('./', '')), 'utf8');

  assert.equal(manifest.publisher, 'leonardx');
  assert.equal(manifest.engines.vscode, '^1.100.0');
  assert.match(agent, /^---\s*\nname: LeoCode/m);
  assert.match(agent, /tools: \['\*'\]/);
  assert.match(agent, /VS Code's native agent tools/);
  assert.deepEqual(
    manifest.contributes.languageModelTools.map(tool => tool.name),
    ['leocode_list_mcp_tools', 'leocode_call_mcp_tool'],
  );
});

test('MCP discovery only returns enabled servers and well-formed tools', () => {
  const servers = parseLeonardXMcpServers({
    servers: [
      {
        id: '12345678-1234-1234-1234-123456789012',
        name: 'Docs',
        enabled: true,
        tools: [{ name: 'search_docs', approved: true, inputSchema: { type: 'object' } }],
      },
      { id: '87654321-4321-4321-4321-210987654321', name: 'Disabled', enabled: false, tools: [] },
      { id: 'bad-id', name: 'Invalid', enabled: true, tools: [] },
    ],
  });

  assert.equal(servers.length, 1);
  assert.equal(servers[0].tools[0].approved, true);
  assert.equal(findApprovedLeonardXMcpTool(servers, servers[0].id, 'search_docs')?.tool.name, 'search_docs');
  assert.equal(findApprovedLeonardXMcpTool(servers, servers[0].id, 'unapproved'), undefined);
});

test('MCP calls require a valid server, tool, and bounded JSON arguments', () => {
  const input = {
    serverId: '12345678-1234-1234-1234-123456789012',
    toolName: 'search_docs',
    arguments: { query: 'agent mode' },
  };
  assert.deepEqual(parseLeonardXMcpCallInput(input), input);
  assert.throws(() => parseLeonardXMcpCallInput({ ...input, toolName: '../other' }), /valid LeonardX MCP/);
  assert.throws(() => parseLeonardXMcpCallInput({
    ...input,
    arguments: { payload: 'x'.repeat(16 * 1024) },
  }), /must not exceed 16 KB/);
});
