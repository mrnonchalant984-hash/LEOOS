import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasExplicitRepositoryCommitIntent,
  hasExplicitRepositoryWriteIntent,
  isSafeFeatureBranch,
} from '../lib/agents/repository-policy.ts';

test('repository write intent requires a direct instruction, not advice or explanation', () => {
  assert.equal(hasExplicitRepositoryWriteIntent('Please implement this feature in my repo'), true);
  assert.equal(hasExplicitRepositoryWriteIntent('Could you edit the README?'), true);
  assert.equal(hasExplicitRepositoryWriteIntent('How can I fix a bug in my repo?'), false);
  assert.equal(hasExplicitRepositoryWriteIntent('I want advice on how to commit changes'), false);
  assert.equal(hasExplicitRepositoryWriteIntent('Explain why you should update the repo'), false);
});

test('commit intent is narrower than general file-change intent', () => {
  assert.equal(hasExplicitRepositoryCommitIntent('Please commit these changes to the feature branch'), true);
  assert.equal(hasExplicitRepositoryCommitIntent('Could you push the changes?'), true);
  assert.equal(hasExplicitRepositoryCommitIntent('Please implement this feature and commit it to a branch'), true);
  assert.equal(hasExplicitRepositoryCommitIntent('Please fix the file in my repo'), false);
});

test('Bram writes only to explicitly named non-default feature branches', () => {
  assert.equal(isSafeFeatureBranch('feature/bram-agent'), true);
  assert.equal(isSafeFeatureBranch('main'), false);
  assert.equal(isSafeFeatureBranch('master'), false);
  assert.equal(isSafeFeatureBranch('../main'), false);
  assert.equal(isSafeFeatureBranch(''), false);
});

test('Bram is owner-only and the approval continuation reconnects request-scoped GitHub tools', async () => {
  const fs = await import('node:fs/promises');
  const registry = await fs.readFile(new URL('../lib/agents/registry.ts', import.meta.url), 'utf8');
  const manager = await fs.readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  const approval = await fs.readFile(new URL('../app/api/agents/approve/route.ts', import.meta.url), 'utf8');
  assert.match(registry, /\['bram','Bram'.*true,\['repository_read','file_read','github_read','github_write','account_read','knowledge_read','gemini_computer_use','price_read'\],\['read','write','sensitive'\],true\]/);
  assert.match(manager, /agent\.id === 'bram'/);
  assert.match(manager, /isSafeFeatureBranch\(branch\)/);
  assert.match(approval, /request: req, persistAgentRun: true/);
});

test('Bram inherits specialist capabilities and receives the internal specialist directory', async () => {
  const fs = await import('node:fs/promises');
  const registry = await fs.readFile(new URL('../lib/agents/registry.ts', import.meta.url), 'utf8');
  const manager = await fs.readFile(new URL('../lib/agents/manager.ts', import.meta.url), 'utf8');
  assert.match(registry, /specialistDefinitions = rawDefs\.filter/);
  assert.match(registry, /\['bram','Bram'.*true,\['repository_read','file_read','github_read','github_write','account_read','knowledge_read','gemini_computer_use'\],\['read','write','sensitive'\],true\]/);
  assert.match(registry, /\['bram','Bram'.*true,\['repository_read','file_read','github_read','github_write','account_read','knowledge_read','gemini_computer_use'\],\['read','write','sensitive'\],true\]/);
  assert.match(manager, /Specialist directory:/);
  assert.match(manager, /maxToolCalls: agent\.id === 'bram' \? 12 : 4/);
  assert.match(manager, /Do not claim a specialist integration is connected/);
});
