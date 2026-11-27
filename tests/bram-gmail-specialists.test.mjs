import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Gmail is a customer-owned OAuth integration with scoped mailbox and send permissions', async () => {
  const [connections, start, callback, verify, operations, migration] = await Promise.all([
    read('../lib/integrations/customer-connections.ts'),
    read('../app/api/integrations/oauth/start/route.ts'),
    read('../app/api/integrations/oauth/callback/route.ts'),
    read('../lib/integrations/provider-verification.ts'),
    read('../app/api/integrations/[provider]/[action]/route.ts'),
    read('../supabase/migrations/20261126130000_gmail_oauth_provider.sql'),
  ]);
  assert.match(connections, /'gmail'/);
  assert.match(start, /gmail\.readonly/);
  assert.match(start, /gmail\.send/);
  assert.match(callback, /provider === 'gmail'/);
  assert.match(verify, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/);
  assert.match(operations, /action === 'list-messages'/);
  assert.match(operations, /action === 'get-message'/);
  assert.match(operations, /action === 'send-message'/);
  assert.match(operations, /body\.confirm !== true/);
  assert.match(migration, /'gmail'/);
});

test('Bram waits for read-only specialist outputs instead of treating queued work as completed', async () => {
  const [manager, tools, registry] = await Promise.all([
    read('../lib/agents/manager.ts'),
    read('../lib/ai/tool-orchestrator.ts'),
    read('../lib/agents/registry.ts'),
  ]);
  assert.match(manager, /executeBramSpecialistTeam/);
  assert.match(manager, /read_only_specialist_handoff/);
  assert.match(manager, /delegatedBy: 'bram'/);
  assert.match(manager, /allowSpecialistExecution: agent\.id === 'bram'/);
  assert.match(tools, /run_specialist_team/);
  assert.match(tools, /await options\.runSpecialists\(task, agentIds\)/);
});
