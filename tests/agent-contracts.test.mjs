import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGENT_CONTEXT_MAX_CHARS,
  AGENT_TASK_MAX_CHARS,
  validateAgentDefinition,
  validateAgentInput,
  validateAgentOutput,
  UAI_PROTOCOL_VERSION,
  validateUaiEvent,
  validateUaiTaskEnvelope,
} from '../lib/agents/contracts.ts';

const definition = (overrides = {}) => ({
  id: 'test-agent',
  name: 'Test agent',
  description: 'Contract fixture',
  category: 'development',
  instructions: 'Use only authorized tools.',
  enabled: true,
  ownerOnly: false,
  allowedTools: ['file_read'],
  permissions: ['read'],
  approvalRequired: false,
  timeoutMs: 60_000,
  maxRetries: 1,
  ...overrides,
});

test('agent input contract rejects empty and oversized task/context payloads', () => {
  assert.equal(validateAgentInput('  ', '').success, false);
  assert.equal(validateAgentInput('x'.repeat(AGENT_TASK_MAX_CHARS + 1), '').success, false);
  assert.equal(validateAgentInput('task', 'x'.repeat(AGENT_CONTEXT_MAX_CHARS + 1)).success, false);
  assert.equal(validateAgentInput(' task ', 'safe context').success, true);
});

test('agent registry contract attaches input/output schemas and requires approval for write tools', () => {
  const readOnly = validateAgentDefinition(definition());
  const writer = validateAgentDefinition(definition({
    id: 'writer-agent',
    allowedTools: ['file_write'],
    permissions: ['read', 'write'],
  }));
  assert.deepEqual(readOnly.inputSchema.required, ['task', 'context']);
  assert.deepEqual(readOnly.outputSchema.required, ['status']);
  assert.equal(readOnly.approvalRequired, false);
  assert.equal(writer.approvalRequired, true);
  assert.throws(() => validateAgentDefinition(definition({ timeoutMs: 500 })), /Invalid agent definition/);
});

test('agent result contract rejects malformed structured responses and preserves browser handoff data', () => {
  assert.equal(validateAgentOutput({ status: 'completed', result: 'done' }).success, true);
  assert.equal(validateAgentOutput({ status: 'unknown', result: 'done' }).success, false);
  const browserResult = validateAgentOutput({
    status: 'waiting_owner_input',
    session_id: 'session-1',
    approvals: [{ type: 'confirm' }],
    message: 'Approval required',
  });
  assert.equal(browserResult.success, true);
});

test('UAI task envelopes are versioned, strict, and idempotency-aware', () => {
  const envelope = {
    protocol_version: UAI_PROTOCOL_VERSION,
    task_id: 'task-123',
    conversation_id: 'conversation-456',
    agent_id: 'developer',
    action: 'analyze_repository',
    status: 'queued',
    idempotency_key: 'request-789',
    correlation_id: 'correlation-abc',
    input: { repository: 'LEOOS' },
    approval_required: false,
    checkpoint_id: null,
    created_at: '2026-11-12T14:00:00.000Z',
    execution: { attempt: 0, max_attempts: 3 },
  };

  assert.equal(validateUaiTaskEnvelope(envelope).success, true);
  assert.equal(validateUaiTaskEnvelope({ ...envelope, protocol_version: '2.0' }).success, false);
  assert.equal(validateUaiTaskEnvelope({ ...envelope, unexpected: true }).success, false);
  assert.equal(validateUaiTaskEnvelope({ ...envelope, idempotency_key: '' }).success, false);
});

test('UAI events retain correlation and reject unsupported lifecycle states', () => {
  const event = {
    protocol_version: UAI_PROTOCOL_VERSION,
    event_id: 'event-123',
    task_id: 'task-123',
    agent_id: 'developer',
    correlation_id: 'correlation-abc',
    event_type: 'task_started',
    status: 'running',
    occurred_at: '2026-11-12T14:00:01.000Z',
    payload: { worker: 'worker-1' },
  };

  assert.equal(validateUaiEvent(event).success, true);
  assert.equal(validateUaiEvent({ ...event, status: 'pretending' }).success, false);
  assert.equal(validateUaiEvent({ ...event, payload: [] }).success, false);
});
