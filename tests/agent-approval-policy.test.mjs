import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AGENT_APPROVAL_TTL_MS,
  agentApprovalMatchesRun,
  isAgentApprovalExpired,
} from '../lib/agents/approval-policy.ts';

test('agent approvals expire after fifteen minutes and invalid timestamps fail closed', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  assert.equal(AGENT_APPROVAL_TTL_MS, 15 * 60_000);
  assert.equal(isAgentApprovalExpired(new Date(now - AGENT_APPROVAL_TTL_MS + 1).toISOString(), now), false);
  assert.equal(isAgentApprovalExpired(new Date(now - AGENT_APPROVAL_TTL_MS).toISOString(), now), true);
  assert.equal(isAgentApprovalExpired(new Date(now + 1).toISOString(), now), true);
  assert.equal(isAgentApprovalExpired('invalid', now), true);
});

test('agent approvals must match the persisted action, agent, and task', () => {
  const approval = { action: 'Run Code Review', metadata: { agent_id: 'code-review', task: 'Review this change' } };
  const run = { agent_id: 'code-review', task: 'Review this change' };
  assert.equal(agentApprovalMatchesRun(approval, run, 'Run Code Review'), true);
  assert.equal(agentApprovalMatchesRun(approval, { ...run, task: 'Different task' }, 'Run Code Review'), false);
  assert.equal(agentApprovalMatchesRun(approval, { ...run, agent_id: 'other-agent' }, 'Run Code Review'), false);
  assert.equal(agentApprovalMatchesRun({ ...approval, action: 'Run another agent' }, run, 'Run Code Review'), false);
});

test('all agent approval routes use a one-time claim and the same expiry policy', () => {
  const approve = fs.readFileSync('app/api/agents/approve/route.ts', 'utf8');
  const cancel = fs.readFileSync('app/api/agents/cancel/route.ts', 'utf8');
  const mcp = fs.readFileSync('app/mcp/route.ts', 'utf8');
  const runs = fs.readFileSync('app/api/agents/runs/route.ts', 'utf8');
  const workforce = fs.readFileSync('app/api/workforce/route.ts', 'utf8');

  assert.match(approve, /req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(approve, /claimPendingAgentApproval/);
  assert.match(approve, /agentApprovalMatchesRun/);
  assert.match(cancel, /cancelPendingAgentApproval/);
  assert.match(cancel, /agentApprovalMatchesRun/);
  assert.match(mcp, /claimPendingAgentApproval/);
  assert.match(mcp, /agentApprovalMatchesRun/);
  assert.match(runs, /AGENT_APPROVAL_TTL_MS/);
  assert.match(workforce, /AGENT_APPROVAL_TTL_MS/);
});
