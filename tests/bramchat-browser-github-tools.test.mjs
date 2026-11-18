import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const chat = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const tools = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
const github = await readFile(new URL('../app/api/integrations/[provider]/[action]/route.ts', import.meta.url), 'utf8');
const research = await readFile(new URL('../app/api/research/route.ts', import.meta.url), 'utf8');
const mcpApprovals = await readFile(new URL('../app/api/mcp/servers/[id]/tools/route.ts', import.meta.url), 'utf8');
const mcpCall = await readFile(new URL('../app/api/mcp/servers/[id]/call/route.ts', import.meta.url), 'utf8');
const mcpMigration = await readFile(new URL('../supabase/migrations/20261118100000_mcp_remote_tool_write_access.sql', import.meta.url), 'utf8');

test('BramChat exposes connected GitHub repository, branch and file creation tools', () => {
  assert.match(chat, /isRepositoryWriteIntent/);
  assert.match(chat, /create\|make\|add/);
  assert.match(tools, /github_create_repository/);
  assert.match(tools, /github_create_branch/);
  assert.match(tools, /github_create_file/);
  assert.match(github, /action === 'create-repo'/);
  assert.match(github, /action === 'create-branch'/);
  assert.match(github, /confirm !== true/);
  assert.match(github, /github: \['create-repo','create-branch'/);
});

test('BramChat web research follows bounded same-origin links and remains read-only', () => {
  assert.match(chat, /isWebsiteResearchIntent/);
  assert.match(chat, /allowWebResearch: webResearchWorkflow/);
  assert.match(tools, /name: 'web_research'/);
  assert.match(tools, /read-only/);
  assert.match(research, /crawlPublicPages/);
  assert.match(research, /internalPageLinks/);
  assert.match(research, /url\.origin !== origin/);
  assert.match(research, /robots\.txt/);
  assert.match(research, /Math\.min\(20/);
  assert.match(research, /Math\.min\(2/);
});

test('Connected MCP write tools require per-tool write approval and an explicit confirmation flag', () => {
  assert.match(mcpMigration, /access_level in \('read', 'write'\)/);
  assert.match(mcpApprovals, /access_level: accessLevel/);
  assert.match(mcpApprovals, /cannot be delegated to specialist agents/);
  assert.match(mcpCall, /accessLevel === 'write'/);
  assert.match(mcpCall, /body\.confirm !== true/);
  assert.match(tools, /allowRemoteWrites/);
  assert.match(tools, /args\.confirm !== true/);
  assert.match(tools, /delete remoteArgs\.confirm/);
});
