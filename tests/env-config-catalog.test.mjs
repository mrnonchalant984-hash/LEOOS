import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEONARDX_ENV_CATALOG,
  buildEnvStatusReport,
  isValidEnvVariableName,
  missingRequiredEnvNames,
  redactSecretValue,
  validateEnvSubmission,
} from '../lib/env-config-catalog.ts';

test('env catalog reports configured state without exposing values', () => {
  const report = buildEnvStatusReport('production', {
    OWNER_EMAIL: 'owner@example.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  });
  const owner = report.find((item) => item.name === 'OWNER_EMAIL');
  assert.equal(owner?.configured, true);
  assert.equal(owner?.message.includes('hidden'), true);
  assert.equal(JSON.stringify(report).includes('service-role-secret'), false);
  assert.equal(redactSecretValue('service-role-secret'), '[redacted]');
});

test('missing required env names are listed by name only', () => {
  const missing = missingRequiredEnvNames('production', {});
  assert.ok(missing.includes('OWNER_EMAIL'));
  assert.ok(missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('validateEnvSubmission rejects unknown variables and empty values', () => {
  assert.equal(isValidEnvVariableName('OPENAI_API_KEY'), true);
  assert.equal(isValidEnvVariableName('openai-key'), false);
  const bad = validateEnvSubmission({ name: 'NOT_A_REAL_VAR', value: 'x', target: 'production' });
  assert.equal(bad.ok, false);
  const empty = validateEnvSubmission({ name: 'OPENAI_API_KEY', value: '   ', target: 'production' });
  assert.equal(empty.ok, false);
  const tooLong = validateEnvSubmission({ name: 'OPENAI_API_KEY', value: 'x'.repeat(16_385), target: 'production' });
  assert.equal(tooLong.ok, false);
  const ok = validateEnvSubmission({ name: 'OPENAI_API_KEY', value: 'sk-test', target: 'production' });
  assert.equal(ok.ok, true);
});

test('worker-only Godot export presets are not sent to the LeonardX Vercel app', () => {
  assert.equal(LEONARDX_ENV_CATALOG.some((item) => item.name === 'GODOT_EXPORT_PRESETS'), false);
});
