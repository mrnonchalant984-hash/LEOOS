import Ajv2020, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';

const MAX_SCHEMA_BYTES = 24 * 1024;
const MAX_ARGUMENT_BYTES = 16 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compileSchema(schema: unknown): ValidateFunction | null {
  if (!isRecord(schema)) return null;
  try {
    const serialized = JSON.stringify(schema);
    if (!serialized || Buffer.byteLength(serialized) > MAX_SCHEMA_BYTES) return null;
    const ajv = new Ajv2020({
      addUsedSchema: false,
      allErrors: false,
      coerceTypes: false,
      ownProperties: true,
      removeAdditional: false,
      strict: false,
      useDefaults: false,
    });
    return ajv.compile(schema as AnySchema);
  } catch {
    return null;
  }
}

export function isValidMcpToolInputSchema(schema: unknown) {
  return compileSchema(schema) !== null;
}

export function validateMcpToolArguments(schema: unknown, args: unknown) {
  if (!isRecord(args)) return false;
  try {
    if (Buffer.byteLength(JSON.stringify(args)) > MAX_ARGUMENT_BYTES) return false;
  } catch {
    return false;
  }
  const validate = compileSchema(schema);
  return Boolean(validate?.(args));
}
