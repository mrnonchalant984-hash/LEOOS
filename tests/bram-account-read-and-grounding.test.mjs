import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Bram account billing tool is read-only and hard-scoped to the authenticated user', async () => {
  const tools = await read('lib/ai/tool-orchestrator.ts');
  const manager = await read('lib/agents/manager.ts');
  const registry = await read('lib/agents/registry.ts');
  const start = tools.indexOf("if (reference.kind === 'get_my_account_billing')");
  const end = tools.indexOf("if (reference.kind === 'list_projects')", start);
  assert.ok(start >= 0 && end > start);
  const executor = tools.slice(start, end);
  assert.match(tools, /allowAccountRead\?: boolean/);
  assert.match(tools, /name: 'get_my_account_billing'/);
  assert.match(executor, /\.eq\('id', userId\)/);
  assert.match(executor, /\.eq\('user_id', userId\)/);
  assert.match(executor, /\.select\('amount,currency,plan,billing_period,reference,status,paid_at,verified_at,refunded_at,created_at'\)/);
  assert.doesNotMatch(executor, /paystack_subscription_code|card_number|cvv|authorization_code/);
  assert.match(executor, /No changes were made/);
  assert.match(manager, /allowAccountRead: agent\.id === 'bram'/);
  assert.match(manager, /allowPriceRead: agent\.id === 'bram'/);
  assert.match(tools, /name: 'list_braverton_prices'/);
  assert.match(tools, /name: 'get_platform_status'/);
  assert.match(manager, /allowPlatformStatusRead: agent\.id === 'bram' && owner/);
  assert.match(registry, /'account_read','knowledge_read','gemini_computer_use','price_read','platform_status_read','price_read'/);
});

test('Knowledge Agent and Bram retrieve curated Braverton knowledge with explicit grounding rules', async () => {
  const manager = await read('lib/agents/manager.ts');
  const knowledge = await read('lib/leo-knowledge.ts');
  const migration = await read('supabase/migrations/20261127170000_bram_knowledge_grounding_and_account_read.sql');
  assert.match(manager, /retrieveLeoKnowledge\(task, 8\)/);
  assert.match(manager, /KNOWLEDGE-GROUNDING CONTRACT/);
  assert.match(manager, /Separate verified implementation status from requirements, proposals, and unknowns/);
  assert.match(knowledge, /PERSISTENT BRAVERTON KNOWLEDGE/);
  assert.match(migration, /create table if not exists public\.leo_knowledge/);
  assert.match(migration, /alter table public\.leo_knowledge enable row level security/);
  assert.match(migration, /Braverton Market payment and payout truth boundaries/);
  assert.match(migration, /no such approved escrow\/wallet policy/);
});

test('Hosted browser agent queues only through the owner-protected ephemeral runtime', async () => {
  const browser = await read('lib/agents/browser-agent-disabled.ts');
  const route = await read('app/api/agents/computer-use/route.ts');
  const chat = await read('app/api/chat/route.ts');
  const admin = await read('app/admin/agents/page.tsx');
  const registry = await read('lib/agents/registry.ts');
  assert.match(browser, /api\/agents\/computer-use/);
  assert.match(browser, /meta\.request/);
  assert.match(route, /isPlatformOwner/);
  assert.match(route, /queueGitHubRuntimeJob/);
  assert.match(route, /public DNS hostname/);
  assert.match(browser, /\['browser', 'computer-use'\]\.includes\(agent\.id\)/);
  assert.match(registry, /\['browser'\],\['read'\],true\]/);
  assert.match(chat, /accountReadWorkflow = Boolean\(ctx/);
  assert.match(chat, /allowComputerUse: browserWorkflow/);
  assert.match(chat, /allowAccountRead: !customAgent && \(accountReadWorkflow \|\| mode === 'tools'\)/);
  assert.match(admin, /const browserAgentAvailable = true/);
  assert.match(admin, /pollBrowserJob/);
  assert.doesNotMatch(admin, /Hosted computer-use execution is currently disabled/);
});
