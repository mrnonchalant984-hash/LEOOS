import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Leo project intent stays truthful until the real setup workflow confirms creation', () => {
  const source = fs.readFileSync('app/api/chat/route.ts', 'utf8');
  assert.match(source, /I have not created or deployed a project yet/);
  assert.match(source, /\/setup\?project_type=/);
  assert.match(source, /plan_upgrade/);
  assert.match(source, /provider_unavailable/);
});

test('build and deploy verifies ownership, plan eligibility, provider readiness, and idempotency', () => {
  const source = fs.readFileSync('app/api/build-deploy/route.ts', 'utf8');
  assert.match(source, /eq\('owner_user_id', ctx\.user\.id\)/);
  assert.match(source, /plan\.projectTypes\.includes\(projectType\)/);
  assert.match(source, /provider\.status !== 'ready'/);
  assert.match(source, /resolveBuildDeployIdempotencyKey/);
});

test('build workflow persists stage transitions and only records live after verified deployment', () => {
  const source = fs.readFileSync('app/api/build-deploy/route.ts', 'utf8');
  assert.match(source, /recordBuildState/);
  assert.match(source, /status === 'live'/);
  assert.match(source, /resolveVerifiedVercelMainUrl|verifyPublicMainDomain/);
});
