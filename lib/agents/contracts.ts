import { z } from 'zod';
import type { AgentDefinition, AgentJsonSchema, AgentPermission } from './types';

export const AGENT_TASK_MAX_CHARS = 4_000;
export const AGENT_CONTEXT_MAX_CHARS = 18_000;
export const UAI_PROTOCOL_VERSION = '1.0';
const TOOL_WRITE_PATTERN = /(?:_write|deployment|website_builder|form_submit|shopping)/;

/**
 * Unified Agent Interface (UAI) is the stable boundary between Leo, durable
 * workers, and specialist implementations. It is intentionally additive: the
 * established agent-run tables remain the source of truth while new callers
 * can validate a portable, versioned execution envelope before persistence.
 */
export const UAI_EXECUTION_STATUSES = [
  'created', 'queued', 'running', 'waiting_approval', 'completed', 'failed',
  'paused', 'cancelled', 'retrying', 'expired',
] as const;

const UaiIdentifierSchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Identifiers may contain letters, numbers, dots, underscores, colons, and hyphens.');
const UaiPayloadSchema = z.record(z.string(), z.unknown());
const UaiStatusSchema = z.enum(UAI_EXECUTION_STATUSES);

export const UaiTaskEnvelopeSchema = z.object({
  protocol_version: z.literal(UAI_PROTOCOL_VERSION),
  task_id: UaiIdentifierSchema,
  conversation_id: UaiIdentifierSchema.optional(),
  agent_id: UaiIdentifierSchema,
  action: z.string().trim().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/),
  status: UaiStatusSchema,
  idempotency_key: UaiIdentifierSchema,
  correlation_id: UaiIdentifierSchema,
  input: UaiPayloadSchema,
  output: UaiPayloadSchema.nullable().optional(),
  approval_required: z.boolean(),
  checkpoint_id: UaiIdentifierSchema.nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  execution: z.object({
    attempt: z.number().int().min(0).max(10),
    max_attempts: z.number().int().min(1).max(10),
  }).strict(),
}).strict();

export const UaiEventSchema = z.object({
  protocol_version: z.literal(UAI_PROTOCOL_VERSION),
  event_id: UaiIdentifierSchema,
  task_id: UaiIdentifierSchema,
  conversation_id: UaiIdentifierSchema.optional(),
  agent_id: UaiIdentifierSchema,
  correlation_id: UaiIdentifierSchema,
  event_type: z.string().trim().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/),
  status: UaiStatusSchema,
  occurred_at: z.string().datetime({ offset: true }),
  payload: UaiPayloadSchema,
}).strict();

export type UaiTaskEnvelope = z.infer<typeof UaiTaskEnvelopeSchema>;
export type UaiEvent = z.infer<typeof UaiEventSchema>;

export function validateUaiTaskEnvelope(value: unknown) {
  return UaiTaskEnvelopeSchema.safeParse(value);
}

export function validateUaiEvent(value: unknown) {
  return UaiEventSchema.safeParse(value);
}

const AgentInputSchema = z.object({
  task: z.string().trim().min(1).max(AGENT_TASK_MAX_CHARS),
  context: z.string().max(AGENT_CONTEXT_MAX_CHARS),
}).strict();

const AgentExecutionSchema = z.object({
  model_id: z.string().max(128).optional(),
  provider: z.string().max(32).optional(),
  fallback_used: z.boolean().optional(),
  tool_calls: z.array(z.object({
    name: z.string().max(128),
    success: z.boolean(),
  }).strict()).max(8).optional(),
}).strict();

const AgentOutputSchema = z.object({
  status: z.enum(['completed', 'waiting_owner_input', 'failed', 'waiting_approval']),
  result: z.string().max(24_000).optional(),
  message: z.string().max(2_000).optional(),
  session_id: z.string().max(256).optional(),
  approvals: z.array(z.unknown()).max(20).optional(),
  execution: AgentExecutionSchema.optional(),
}).strict();

const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const PERMISSIONS = new Set<AgentPermission>(['read', 'write', 'sensitive', 'critical']);

export const AGENT_INPUT_JSON_SCHEMA: AgentJsonSchema = {
  type: 'object',
  properties: {
    task: { type: 'string', minLength: 1, maxLength: AGENT_TASK_MAX_CHARS },
    context: { type: 'string', maxLength: AGENT_CONTEXT_MAX_CHARS },
  },
  required: ['task', 'context'],
  additionalProperties: false,
};

export const AGENT_OUTPUT_JSON_SCHEMA: AgentJsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['completed', 'waiting_owner_input'] },
    result: { type: 'string', maxLength: 24_000 },
    message: { type: 'string', maxLength: 2_000 },
    session_id: { type: 'string', maxLength: 256 },
    approvals: { type: 'array', maxItems: 20, items: {} },
    execution: {
      type: 'object',
      properties: {
        model_id: { type: 'string', maxLength: 128 },
        provider: { type: 'string', maxLength: 32 },
        fallback_used: { type: 'boolean' },
        tool_calls: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: { name: { type: 'string', maxLength: 128 }, success: { type: 'boolean' } },
            required: ['name', 'success'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  required: ['status'],
  additionalProperties: false,
};

export function validateAgentInput(task: unknown, context: unknown) {
  return AgentInputSchema.safeParse({ task, context });
}

export function validateAgentOutput(value: unknown) {
  return AgentOutputSchema.safeParse(value);
}

export function validateAgentDefinition<T extends Omit<AgentDefinition, 'inputSchema' | 'outputSchema'>>(
  definition: T,
): AgentDefinition {
  if (!definition || typeof definition.id !== 'string' ||
      typeof definition.name !== 'string' ||
      typeof definition.instructions !== 'string' ||
      !Array.isArray(definition.allowedTools) ||
      !Array.isArray(definition.permissions) ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(definition.id) ||
      !definition.name.trim() ||
      !definition.instructions.trim() ||
      !definition.allowedTools.every(tool => CAPABILITY_PATTERN.test(tool)) ||
      !definition.permissions.every(permission => PERMISSIONS.has(permission)) ||
      !Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1_000 || definition.timeoutMs > 120_000 ||
      !Number.isInteger(definition.maxRetries) || definition.maxRetries < 0 || definition.maxRetries > 2) {
    throw new Error(`Invalid agent definition: ${definition.id}`);
  }

  const requiresApproval = definition.permissions.some(permission =>
    permission === 'sensitive' || permission === 'critical',
  ) || definition.allowedTools.some(tool => TOOL_WRITE_PATTERN.test(tool));

  return {
    ...definition,
    approvalRequired: definition.approvalRequired || requiresApproval,
    inputSchema: AGENT_INPUT_JSON_SCHEMA,
    outputSchema: AGENT_OUTPUT_JSON_SCHEMA,
  };
}
